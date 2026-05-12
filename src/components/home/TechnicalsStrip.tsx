"use client";
import { useQuery } from "@tanstack/react-query";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { cn } from "@/lib/utils";

interface Props { ticker: string }

type Sig = "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";

const SIG_CLS: Record<Sig, string> = {
  "strong-buy":  "text-[#3fb950] bg-[#3fb95018] border-[#3fb95044]",
  "buy":         "text-[#56d364] bg-[#56d36412] border-[#56d36438]",
  "neutral":     "text-[#8b949e] bg-transparent border-[#30363d]",
  "sell":        "text-[#f85149] bg-[#f8514912] border-[#f8514940]",
  "strong-sell": "text-[#f85149] bg-[#f8514920] border-[#f8514960]",
};
const SIG_DOT: Record<Sig, string> = {
  "strong-buy":"bg-[#3fb950]","buy":"bg-[#56d364]","neutral":"bg-[#484f58]","sell":"bg-[#f85149]","strong-sell":"bg-[#f85149]",
};

function lastValidNum(arr?: number[]) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null && !isNaN(arr[i])) return arr[i];
  }
  return null;
}

function TechCard({ name, value, signal, sub }: { name: string; value: string; signal: Sig; sub?: string }) {
  return (
    <div className="flex-shrink-0 flex flex-col gap-2 rounded-xl border border-[#21262d] bg-[#161b22] px-4 py-3 min-w-[130px] hover:border-[#30363d] transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">{name}</span>
        <span className={cn("flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide", SIG_CLS[signal])}>
          <span className={cn("w-1.5 h-1.5 rounded-full", SIG_DOT[signal])} />
          {signal.replace("-", " ")}
        </span>
      </div>
      <div className="text-lg font-bold font-mono text-white leading-none">{value}</div>
      {sub && <div className="text-[10px] text-[#484f58]">{sub}</div>}
    </div>
  );
}

export default function TechnicalsStrip({ ticker }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["history-indicators", ticker, "3M"],
    queryFn: async () => {
      const r = await fetch(`/api/market/history/${ticker}?tf=3M&indicators=true`);
      return r.json() as Promise<{ bars: OHLCVBar[]; indicators: TechnicalIndicators }>;
    },
    staleTime: 60000,
  });

  const ind = data?.indicators;
  const close = data?.bars?.at(-1)?.close;

  const cards = (() => {
    if (!ind || close == null) return [];
    const out: { name: string; value: string; signal: Sig; sub?: string }[] = [];

    // RSI
    const rsi = lastValidNum(ind.rsi);
    if (rsi != null) {
      out.push({ name: "RSI (14)", value: rsi.toFixed(1),
        signal: rsi < 20 ? "strong-buy" : rsi < 30 ? "buy" : rsi > 80 ? "strong-sell" : rsi > 70 ? "sell" : "neutral",
        sub: rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Neutral zone" });
    }

    // MACD
    const macdV = lastValidNum(ind.macd?.macd);
    const sigV  = lastValidNum(ind.macd?.signal);
    const hist  = lastValidNum(ind.macd?.histogram);
    if (macdV != null && sigV != null) {
      out.push({ name: "MACD", value: macdV.toFixed(3),
        signal: macdV > sigV ? "buy" : macdV < sigV ? "sell" : "neutral",
        sub: hist != null ? `Hist ${hist > 0 ? "+" : ""}${hist.toFixed(3)}` : undefined });
    }

    // Bollinger
    const upper = lastValidNum(ind.bollinger?.upper);
    const lower = lastValidNum(ind.bollinger?.lower);
    const mid   = lastValidNum(ind.bollinger?.middle);
    if (upper != null && lower != null && mid != null) {
      const bw = ((upper - lower) / mid * 100).toFixed(1);
      const sig: Sig = close > upper ? "sell" : close < lower ? "strong-buy" : "neutral";
      out.push({ name: "Bollinger", value: close > upper ? "Above" : close < lower ? "Below" : "Inside",
        signal: sig, sub: `BW ${bw}%` });
    }

    // Stochastic
    const stochK = lastValidNum(ind.stochastic?.k);
    const stochD = lastValidNum(ind.stochastic?.d);
    if (stochK != null) {
      out.push({ name: "Stochastic", value: stochK.toFixed(1),
        signal: stochK > 80 ? "sell" : stochK < 20 ? "buy" : "neutral",
        sub: stochD != null ? `%D ${stochD.toFixed(1)}` : undefined });
    }

    // ADX
    const adx  = lastValidNum(ind.adx?.adx);
    const pdi  = lastValidNum(ind.adx?.pdi);
    const mdi  = lastValidNum(ind.adx?.mdi);
    if (adx != null && pdi != null && mdi != null) {
      const dir: Sig = pdi > mdi ? "buy" : pdi < mdi ? "sell" : "neutral";
      out.push({ name: "ADX / DMI", value: adx.toFixed(1),
        signal: dir,
        sub: adx >= 25 ? "Strong trend" : "Weak trend" });
    }

    // CCI
    const cci = lastValidNum(ind.cci);
    if (cci != null) {
      out.push({ name: "CCI (20)", value: cci.toFixed(0),
        signal: cci > 200 ? "strong-sell" : cci > 100 ? "sell" : cci < -200 ? "strong-buy" : cci < -100 ? "buy" : "neutral",
        sub: cci > 100 ? "Overbought" : cci < -100 ? "Oversold" : "Normal range" });
    }

    return out;
  })();

  return (
    <div className="rounded-2xl border border-[#21262d] bg-[#161b22] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold text-white">Technical Indicators</span>
        <span className="text-[10px] text-[#484f58]">3M timeframe</span>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 min-w-[130px] h-[76px] rounded-xl bg-[#21262d] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {cards.map(c => <TechCard key={c.name} {...c} />)}
        </div>
      )}
    </div>
  );
}
