import YahooFinanceClass from "yahoo-finance2";
import { getQuote, getHistory, getFundamentals, getEarnings, getQualityData, getInsiderTransactions } from "@/lib/market/yahoo";

/* eslint-disable @typescript-eslint/no-explicit-any */
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });
const safeN = (val: any): number | undefined => {
  if (val == null) return undefined;
  if (typeof val === "number") return isFinite(val) ? val : undefined;
  if (typeof val === "object" && "raw" in val) { const n = val.raw as number; return isFinite(n) ? n : undefined; }
  return undefined;
};

// ── DCF helpers ───────────────────────────────────────────────────────────────
const ERP = 0.055; const TAX_RATE = 0.21; const TERMINAL_GROWTH = 0.03;
function runDCF(fcfPerShare: number, growthRate: number, wacc: number) {
  const fadeRate = growthRate / 2;
  let fcf = fcfPerShare; let pvHigh = 0; let pvFade = 0;
  for (let t = 1; t <= 5; t++) { fcf *= (1 + growthRate); pvHigh += fcf / Math.pow(1 + wacc, t); }
  for (let t = 6; t <= 10; t++) { fcf *= (1 + fadeRate); pvFade += fcf / Math.pow(1 + wacc, t); }
  const tvPV = (fcf * (1 + TERMINAL_GROWTH) / (wacc - TERMINAL_GROWTH)) / Math.pow(1 + wacc, 10);
  return { intrinsicValue: pvHigh + pvFade + tvPV, pvHighGrowth: pvHigh, pvFade, pvTerminal: tvPV };
}

// ── Heatmap helpers ───────────────────────────────────────────────────────────
const WARMUP = 220;
type Cell = "bullish" | "bearish" | "neutral";
function lastV(arr?: number[]): number | null {
  if (!arr?.length) return null; const v = arr[arr.length - 1]; return isNaN(v) ? null : v;
}
async function analyzeHeatmapTF(ticker: string, days: number, interval: "1d" | "1wk") {
  const from = new Date(Date.now() - (days + WARMUP) * 86400000);
  const allBars = await getHistory(ticker, interval, from);
  if (allBars.length < 30) return { trend: "neutral", momentum: "neutral", macd: "neutral", volume: "neutral", position: "neutral" };
  const ind = computeIndicators(allBars);
  const price = allBars[allBars.length - 1].close;
  const displayFrom = Date.now() / 1000 - days * 86400;
  const disp = allBars.filter(b => b.time >= displayFrom);
  const barsR = disp.length >= 5 ? disp : allBars;
  const hi = Math.max(...barsR.map(b => b.high)); const lo = Math.min(...barsR.map(b => b.low));
  const ema50 = lastV(ind.ema50);
  const rsi   = lastV(ind.rsi);
  const macdV = lastV(ind.macd?.macd); const sigV = lastV(ind.macd?.signal);
  const obv   = (ind.obv ?? []).filter(v => !isNaN(v));
  const pos   = (hi - lo) > 0 ? (price - lo) / (hi - lo) : 0.5;
  return {
    trend:    (ema50 == null ? "neutral" : price > ema50 ? "bullish" : "bearish") as Cell,
    momentum: (rsi == null ? "neutral" : rsi > 60 ? "bullish" : rsi < 40 ? "bearish" : "neutral") as Cell,
    macd:     (macdV == null || sigV == null ? "neutral" : macdV > sigV ? "bullish" : "bearish") as Cell,
    volume:   (obv.length < 6 ? "neutral" : obv[obv.length - 1] > obv[obv.length - 6] ? "bullish" : "bearish") as Cell,
    position: (pos > 0.65 ? "bullish" : pos < 0.35 ? "bearish" : "neutral") as Cell,
  };
}
import { computeIndicators } from "@/lib/market/indicators";
import { getNews } from "@/lib/market/news";
import { TIMEFRAMES } from "@/types/market";

// ── Quality scoring helpers (mirrors /api/market/quality) ─────────────────────
function _scoreMargin(v?: number) { return v==null?0.5:v<0?0:v<0.05?0.25:v<0.15?0.55:v<0.25?0.78:1; }
function _scoreROE(v?: number)    { return v==null?0.5:v<0?0:v<0.05?0.2:v<0.10?0.45:v<0.20?0.72:1; }
function _scoreROA(v?: number)    { return v==null?0.5:v<0?0:v<0.03?0.3:v<0.07?0.62:1; }
function _scoreGrowth(v?: number) { return v==null?0.5:v<-0.1?0:v<0?0.2:v<0.05?0.4:v<0.15?0.68:v<0.30?0.85:1; }
function _scoreD2E(v?: number)    { return v==null?0.5:v>300?0:v>200?0.2:v>100?0.5:v>50?0.75:1; }
function _scoreCR(v?: number)     { return v==null?0.5:v<1?0.1:v<1.5?0.5:v<2.5?0.85:1; }
function _scoreFCF(fcf?: number, ocf?: number) {
  if (!fcf||!ocf||ocf===0) return 0.5;
  const r=fcf/ocf; return r<0?0:r<0.3?0.3:r<0.6?0.6:r<0.85?0.82:1;
}
function _avg(...vals: number[]) {
  const v=vals.filter(x=>!isNaN(x)); return v.length?v.reduce((a,b)=>a+b,0)/v.length:0.5;
}
function _clamp(v: number) { return Math.max(0, Math.min(1, v)); }

function getTimeframeDates(tf = "3M") {
  const frame = TIMEFRAMES.find((t) => t.value === tf) ?? TIMEFRAMES[3];
  const now = new Date();
  const from = new Date(now.getTime() - frame.days * 24 * 60 * 60 * 1000);
  const interval = frame.interval as Parameters<typeof getHistory>[1];
  return { from, interval };
}

export async function executeTool(name: string, args: Record<string, string>): Promise<unknown> {
  switch (name) {
    case "get_price_data": {
      const { from, interval } = getTimeframeDates(args.timeframe);
      const [quote, bars] = await Promise.all([
        getQuote(args.ticker),
        getHistory(args.ticker, interval, from),
      ]);
      return {
        quote,
        recentBars: bars.slice(-60).map((b) => ({
          date: new Date(b.time * 1000).toISOString().split("T")[0],
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
        })),
        totalBars: bars.length,
        timeframe: args.timeframe ?? "3M",
      };
    }

    case "get_technical_indicators": {
      const { from, interval } = getTimeframeDates(args.timeframe ?? "3M");
      const bars = await getHistory(args.ticker, interval, from);
      const quote = await getQuote(args.ticker);
      const indicators = computeIndicators(bars);
      const lastN = (arr?: number[], n = 5) =>
        arr ? arr.slice(-n).map((v) => (isNaN(v) ? null : +v.toFixed(4))) : [];
      return {
        ticker: args.ticker,
        price: quote.price,
        rsi: {
          current: lastN(indicators.rsi, 1)[0],
          recent: lastN(indicators.rsi, 5),
          interpretation:
            (indicators.rsi?.slice(-1)[0] ?? 50) > 70
              ? "Overbought"
              : (indicators.rsi?.slice(-1)[0] ?? 50) < 30
              ? "Oversold"
              : "Neutral",
        },
        macd: {
          macd: lastN(indicators.macd?.macd, 1)[0],
          signal: lastN(indicators.macd?.signal, 1)[0],
          histogram: lastN(indicators.macd?.histogram, 1)[0],
          crossover:
            (indicators.macd?.histogram?.slice(-1)[0] ?? 0) > 0 ? "Bullish" : "Bearish",
        },
        bollinger: {
          upper: lastN(indicators.bollinger?.upper, 1)[0],
          middle: lastN(indicators.bollinger?.middle, 1)[0],
          lower: lastN(indicators.bollinger?.lower, 1)[0],
          pricePosition:
            quote.price > (indicators.bollinger?.upper?.slice(-1)[0] ?? Infinity)
              ? "Above Upper Band"
              : quote.price < (indicators.bollinger?.lower?.slice(-1)[0] ?? 0)
              ? "Below Lower Band"
              : "Within Bands",
        },
        ema: {
          ema9: lastN(indicators.ema9, 1)[0],
          ema21: lastN(indicators.ema21, 1)[0],
          ema50: lastN(indicators.ema50, 1)[0],
          ema200: lastN(indicators.ema200, 1)[0],
          trend:
            (indicators.ema50?.slice(-1)[0] ?? 0) > (indicators.ema200?.slice(-1)[0] ?? 0)
              ? "Golden Cross (Bullish)"
              : "Death Cross (Bearish)",
        },
        stochastic: (() => {
          const k = indicators.stochastic?.k?.slice(-1)[0];
          const d = indicators.stochastic?.d?.slice(-1)[0];
          return {
            k: k != null && !isNaN(k) ? +k.toFixed(2) : null,
            d: d != null && !isNaN(d) ? +d.toFixed(2) : null,
            interpretation: k == null ? "N/A" : k > 80 ? "Overbought" : k < 20 ? "Oversold" : "Neutral",
          };
        })(),
        adx: (() => {
          const adxVal = indicators.adx?.adx?.slice(-1)[0];
          const pdi = indicators.adx?.pdi?.slice(-1)[0];
          const mdi = indicators.adx?.mdi?.slice(-1)[0];
          return {
            adx: adxVal != null && !isNaN(adxVal) ? +adxVal.toFixed(2) : null,
            pdi: pdi != null && !isNaN(pdi) ? +pdi.toFixed(2) : null,
            mdi: mdi != null && !isNaN(mdi) ? +mdi.toFixed(2) : null,
            trendStrength: adxVal == null ? "N/A" : adxVal > 25 ? "Trending" : adxVal > 20 ? "Weak trend" : "Ranging",
            direction: pdi != null && mdi != null ? (pdi > mdi ? "Bullish" : "Bearish") : "N/A",
          };
        })(),
        cci: (() => {
          const cciVal = indicators.cci?.slice(-1)[0];
          return {
            value: cciVal != null && !isNaN(cciVal) ? +cciVal.toFixed(2) : null,
            interpretation: cciVal == null ? "N/A" : cciVal > 100 ? "Overbought" : cciVal < -100 ? "Oversold" : "Neutral",
          };
        })(),
        obv: (() => {
          const obvArr = (indicators.obv ?? []).filter(v => !isNaN(v));
          const rising = obvArr.length >= 6 ? obvArr[obvArr.length - 1] > obvArr[obvArr.length - 6] : null;
          return {
            current: obvArr.length ? obvArr[obvArr.length - 1] : null,
            trend: rising === null ? "N/A" : rising ? "Rising (accumulation)" : "Falling (distribution)",
          };
        })(),
        psar: (() => {
          const psarVal = indicators.psar?.slice(-1)[0];
          return {
            value: psarVal != null && !isNaN(psarVal) ? +psarVal.toFixed(4) : null,
            signal: psarVal == null ? "N/A" : psarVal < quote.price ? "Bullish (price above PSAR)" : "Bearish (price below PSAR)",
          };
        })(),
      };
    }

    case "get_fundamentals": {
      const f = await getFundamentals(args.ticker);
      return f;
    }

    case "get_news_sentiment": {
      const news = await getNews(args.ticker);
      const pos = news.filter((n) => n.sentiment === "positive").length;
      const neg = news.filter((n) => n.sentiment === "negative").length;
      return {
        ticker: args.ticker,
        overallSentiment: pos > neg ? "Positive" : neg > pos ? "Negative" : "Neutral",
        positiveCount: pos,
        negativeCount: neg,
        neutralCount: news.length - pos - neg,
        recentHeadlines: news.slice(0, 5).map((n) => ({
          title: n.title,
          source: n.source,
          sentiment: n.sentiment,
          publishedAt: n.publishedAt,
        })),
      };
    }

    case "get_earnings": {
      const earnings = await getEarnings(args.ticker);
      const beats = earnings.filter((e) => e.beat === true).length;
      const total = earnings.filter((e) => e.beat != null).length;
      return {
        ticker: args.ticker,
        beatRate: total > 0 ? `${Math.round((beats / total) * 100)}%` : "N/A",
        recentEarnings: earnings.slice(-8),
      };
    }

    case "get_business_quality": {
      const d = await getQualityData(args.ticker);
      const profitability = _clamp(_avg(_scoreMargin(d.profitMargins), _scoreMargin(d.operatingMargins), _scoreROE(d.returnOnEquity), _scoreROA(d.returnOnAssets)));
      const growth       = _clamp(_avg(_scoreGrowth(d.revenueGrowth), _scoreGrowth(d.earningsGrowth)));
      const health       = _clamp(_avg(_scoreD2E(d.debtToEquity), _scoreCR(d.currentRatio)));
      const efficiency   = _clamp(_avg(_scoreFCF(d.freeCashflow, d.operatingCashflow), _scoreROA(d.returnOnAssets)));
      const overall      = _clamp(_avg(profitability, growth, health, efficiency));
      return {
        ticker: args.ticker,
        scores: {
          overall:       Math.round(overall * 100),
          profitability: Math.round(profitability * 100),
          growth:        Math.round(growth * 100),
          health:        Math.round(health * 100),
          efficiency:    Math.round(efficiency * 100),
        },
        rawMetrics: {
          profitMargins:    d.profitMargins,
          operatingMargins: d.operatingMargins,
          returnOnEquity:   d.returnOnEquity,
          returnOnAssets:   d.returnOnAssets,
          revenueGrowth:    d.revenueGrowth,
          earningsGrowth:   d.earningsGrowth,
          debtToEquity:     d.debtToEquity,
          currentRatio:     d.currentRatio,
          freeCashflow:     d.freeCashflow,
          operatingCashflow:d.operatingCashflow,
        },
      };
    }

    case "get_narrative": {
      const articles = await getNews(args.ticker);
      if (!articles.length) return { ticker: args.ticker, stage: "unknown", totalArticles: 0 };
      const sorted = [...articles].sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
      const mid = Math.floor(sorted.length / 2);
      const avgSent = (arr: typeof sorted) => arr.length ? arr.reduce((s,a) => s + a.sentimentScore, 0) / arr.length : 0;
      const olderSentiment  = avgSent(sorted.slice(0, mid));
      const recentSentiment = avgSent(sorted.slice(mid));
      const sentimentTrend  = recentSentiment - olderSentiment;
      const totalArticles   = articles.length;
      const recentFraction  = sorted.slice(mid).length / totalArticles;
      const positive = articles.filter(a => a.sentiment === "positive").length;
      const negative = articles.filter(a => a.sentiment === "negative").length;
      let stage: string;
      if (totalArticles <= 4) { stage = recentFraction > 0.6 ? "emerging" : "fading"; }
      else if (recentFraction > 0.6 && sentimentTrend >= 0) { stage = totalArticles > 12 ? "building" : "emerging"; }
      else if (recentFraction > 0.5 && totalArticles > 10) { stage = "consensus"; }
      else if (recentFraction < 0.4) { stage = "fading"; }
      else { stage = "building"; }
      return {
        ticker: args.ticker,
        stage,
        totalArticles,
        positive,
        negative,
        neutral: totalArticles - positive - negative,
        sentimentTrend: Math.round(sentimentTrend * 100) / 100,
        recentSentiment: Math.round(recentSentiment * 100) / 100,
        recentHeadlines: articles.slice(0, 5).map(n => ({ title: n.title, sentiment: n.sentiment, publishedAt: n.publishedAt })),
      };
    }

    case "get_insider_activity": {
      const transactions = await getInsiderTransactions(args.ticker);
      const netShares = transactions.reduce((acc, t) => acc + (t.isBuy ? Math.abs(t.shares) : -Math.abs(t.shares)), 0);
      const recentBuys  = transactions.filter(t => t.isBuy).slice(0, 5);
      const recentSells = transactions.filter(t => !t.isBuy).slice(0, 5);
      return {
        ticker: args.ticker,
        netShares,
        signal: netShares > 0 ? "Net buying" : netShares < 0 ? "Net selling" : "Neutral",
        totalTransactions: transactions.length,
        buyCount:  transactions.filter(t => t.isBuy).length,
        sellCount: transactions.filter(t => !t.isBuy).length,
        recentBuys:  recentBuys.map(t => ({ name: t.name, relation: t.relation, shares: t.shares, value: t.value, date: t.date })),
        recentSells: recentSells.map(t => ({ name: t.name, relation: t.relation, shares: t.shares, value: t.value, date: t.date })),
      };
    }

    case "get_fair_value": {
      const [summary, quote] = await Promise.all([
        yf.quoteSummary(args.ticker.toUpperCase(), { modules: ["defaultKeyStatistics", "financialData", "earningsTrend"] }).catch(() => null),
        yf.quote(args.ticker.toUpperCase()).catch(() => null),
      ]);
      const ks = (summary as any)?.defaultKeyStatistics;
      const fd = (summary as any)?.financialData;
      const trend = (summary as any)?.earningsTrend?.trend as any[] | undefined;
      const currentPrice = safeN((quote as any)?.regularMarketPrice);
      const trailingEps  = safeN(ks?.trailingEps);
      let growthRate: number | undefined; let growthSource = "5Y est.";
      if (trend) { const fy = trend.find((t: any) => t.period === "5y"); const r = safeN(fy?.growth); if (r != null && r > 0) { growthRate = r * 100; } }
      if (growthRate == null) { const eg = safeN(fd?.earningsGrowth); if (eg != null && eg > 0) { growthRate = eg * 100; growthSource = "TTM growth"; } }
      if (growthRate == null || trailingEps == null || trailingEps <= 0) return { ticker: args.ticker, error: "Insufficient data for fair value calculation" };
      const cg = Math.min(Math.max(growthRate, 0), 50);
      const fairValue = trailingEps * cg;
      const upside = currentPrice != null ? ((fairValue - currentPrice) / currentPrice) * 100 : null;
      const peg = currentPrice != null && trailingEps > 0 ? currentPrice / trailingEps / cg : null;
      return {
        ticker: args.ticker,
        model: "Peter Lynch Fair Value (EPS × Growth Rate %)",
        fairValue: +fairValue.toFixed(2),
        currentPrice: currentPrice ? +currentPrice.toFixed(2) : null,
        trailingEps: +trailingEps.toFixed(4),
        growthRatePct: +cg.toFixed(2),
        growthSource,
        upsidePct: upside != null ? +upside.toFixed(2) : null,
        peg: peg != null ? +peg.toFixed(3) : null,
        interpretation: upside == null ? "N/A" : upside > 20 ? "Undervalued" : upside > 0 ? "Slightly undervalued" : upside > -20 ? "Slightly overvalued" : "Overvalued",
        pegNote: peg == null ? "N/A" : peg < 1 ? "PEG < 1: potentially cheap vs growth" : peg < 2 ? "PEG 1–2: fairly valued" : "PEG > 2: expensive vs growth",
      };
    }

    case "get_dcf_valuation": {
      const [summary, quote, tnx] = await Promise.all([
        yf.quoteSummary(args.ticker.toUpperCase(), { modules: ["defaultKeyStatistics", "summaryDetail", "financialData", "earningsTrend"] }).catch(() => null),
        yf.quote(args.ticker.toUpperCase()).catch(() => null),
        yf.quote("^TNX").catch(() => null),
      ]);
      const ks = (summary as any)?.defaultKeyStatistics;
      const sd = (summary as any)?.summaryDetail;
      const fd = (summary as any)?.financialData;
      const trend = (summary as any)?.earningsTrend?.trend as any[] | undefined;
      const currentPrice      = safeN((quote as any)?.regularMarketPrice);
      const freeCashflow      = safeN(fd?.freeCashflow);
      const sharesOutstanding = safeN(ks?.sharesOutstanding);
      const beta              = safeN(sd?.beta) ?? 1.0;
      const debtToEquityPct   = safeN(fd?.debtToEquity);
      if (!freeCashflow || freeCashflow <= 0 || !sharesOutstanding) return { ticker: args.ticker, error: "Insufficient FCF data for DCF" };
      const fcfPerShare = freeCashflow / sharesOutstanding;
      const rfRate = (tnx as any)?.regularMarketPrice ? (tnx as any).regularMarketPrice / 100 : 0.045;
      const costOfEquity = rfRate + beta * ERP;
      const deRatio      = debtToEquityPct != null ? debtToEquityPct / 100 : 0;
      const we = deRatio > 0 ? 1 / (1 + deRatio) : 1;
      const wd = deRatio > 0 ? deRatio / (1 + deRatio) : 0;
      const wacc = we * costOfEquity + wd * (rfRate + 0.02) * (1 - TAX_RATE);
      if (wacc <= TERMINAL_GROWTH) return { ticker: args.ticker, error: "WACC ≤ terminal growth — DCF undefined" };
      let growthRate: number | undefined;
      if (trend) { const fy = trend.find((t: any) => t.period === "5y"); const r = safeN(fy?.growth); if (r != null && r > 0) growthRate = r; }
      if (growthRate == null) { const eg = safeN(fd?.earningsGrowth); if (eg != null && eg > 0) growthRate = eg; }
      if (growthRate == null) return { ticker: args.ticker, error: "No growth rate available for DCF" };
      const cg = Math.min(growthRate, 0.50);
      const base = runDCF(fcfPerShare, cg, wacc);
      const bear = runDCF(fcfPerShare, cg * 0.6, wacc + 0.01);
      const bull = runDCF(fcfPerShare, Math.min(cg * 1.4, 0.50), wacc - 0.01);
      const upside = currentPrice != null ? ((base.intrinsicValue - currentPrice) / currentPrice) * 100 : null;
      return {
        ticker: args.ticker,
        model: "10-Year DCF (5Y high-growth + 5Y fade + terminal value)",
        currentPrice: currentPrice ? +currentPrice.toFixed(2) : null,
        scenarios: {
          bear: +bear.intrinsicValue.toFixed(2),
          base: +base.intrinsicValue.toFixed(2),
          bull: +bull.intrinsicValue.toFixed(2),
        },
        upsidePct: upside != null ? +upside.toFixed(2) : null,
        assumptions: {
          fcfPerShare: +fcfPerShare.toFixed(4),
          growthRatePct: +(cg * 100).toFixed(2),
          waccPct: +(wacc * 100).toFixed(2),
          rfRatePct: +(rfRate * 100).toFixed(2),
          beta,
          terminalGrowthPct: TERMINAL_GROWTH * 100,
        },
        pvBreakdown: {
          highGrowthPhase: +base.pvHighGrowth.toFixed(2),
          fadePhase: +base.pvFade.toFixed(2),
          terminalValue: +base.pvTerminal.toFixed(2),
        },
        interpretation: upside == null ? "N/A" : upside > 30 ? "Significant margin of safety" : upside > 10 ? "Moderate upside" : upside > -10 ? "Fairly valued" : "Trading above intrinsic value",
      };
    }

    case "get_technical_heatmap": {
      const HM_TFS = [
        { label: "1M", days: 30,  interval: "1d"  as const },
        { label: "3M", days: 90,  interval: "1d"  as const },
        { label: "6M", days: 180, interval: "1d"  as const },
        { label: "1Y", days: 365, interval: "1d"  as const },
        { label: "2Y", days: 730, interval: "1wk" as const },
      ];
      const results = await Promise.all(HM_TFS.map(tf => analyzeHeatmapTF(args.ticker.toUpperCase(), tf.days, tf.interval)));
      const rows = ["trend", "momentum", "macd", "volume", "position"] as const;
      const rowLabels: Record<string, string> = { trend: "Trend (EMA50)", momentum: "Momentum (RSI)", macd: "MACD crossover", volume: "Volume (OBV)", position: "Price position" };
      const grid = rows.map(row => ({
        signal: rowLabels[row],
        cells: HM_TFS.map((tf, i) => ({ timeframe: tf.label, rating: (results[i] as any)[row] as Cell })),
      }));
      const allCells = grid.flatMap(r => r.cells.map(c => c.rating));
      const bullCount = allCells.filter(v => v === "bullish").length;
      const bearCount = allCells.filter(v => v === "bearish").length;
      const total = allCells.length;
      const bias: "bullish" | "bearish" | "mixed" = bullCount > bearCount ? "bullish" : bearCount > bullCount ? "bearish" : "mixed";
      return {
        ticker: args.ticker,
        timeframes: HM_TFS.map(t => t.label),
        signals: rows.map(s => rowLabels[s]),
        grid,
        summary: {
          bias,
          bullishSignals: bullCount,
          bearishSignals: bearCount,
          neutralSignals: total - bullCount - bearCount,
          agreementPct: Math.round((Math.max(bullCount, bearCount) / total) * 100),
        },
        interpretation: bias === "bullish"
          ? `${bullCount}/${total} signals bullish — broad technical alignment to the upside`
          : bias === "bearish"
          ? `${bearCount}/${total} signals bearish — broad technical pressure to the downside`
          : "Mixed signals across timeframes — no clear directional conviction",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
