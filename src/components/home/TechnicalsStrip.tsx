"use client";
import { useQuery } from "@tanstack/react-query";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { cn } from "@/lib/utils";

interface Props { ticker: string }

type Sig = "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";

const SIG_CLS: Record<Sig, string> = {
  "strong-buy":  "text-[#00ff8a] bg-[#00ff8a0e] border-[#00ff8a33]",
  "buy":         "text-[#00e87c] bg-[#00e87c0a] border-[#00e87c28]",
  "neutral":     "text-[#5a9e7a] bg-transparent border-[#152b1e]",
  "sell":        "text-[#ff4545] bg-[#ff45450a] border-[#ff454530]",
  "strong-sell": "text-[#ff2020] bg-[#ff20200e] border-[#ff202040]",
};
const SIG_DOT: Record<Sig, string> = {
  "strong-buy": "bg-[#00ff8a]", "buy": "bg-[#00e87c]", "neutral": "bg-[#2d5040]",
  "sell": "bg-[#ff4545]", "strong-sell": "bg-[#ff2020]",
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
    <div className="flex-shrink-0 flex flex-col gap-2 rounded border border-[#152b1e] bg-[#0a1610] px-4 py-3 min-w-[130px] hover:border-[#1e4030] transition-colors"
         style={{ boxShadow: signal === "strong-buy" || signal === "buy" ? "inset 0 0 12px rgba(0,232,124,0.04)" : signal === "sell" || signal === "strong-sell" ? "inset 0 0 12px rgba(255,69,69,0.04)" : "none" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] font-bold text-[#2d5040] uppercase tracking-widest">{name}</span>
        <span className={cn("flex items-center gap-1 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide", SIG_CLS[signal])}>
          <span className={cn("w-1.5 h-1.5 rounded-full", SIG_DOT[signal])} />
          {signal.replace("-", " ")}
        </span>
      </div>
      <div className="font-mono text-lg font-black text-[#c8edd8] leading-none tabular-nums">{value}</div>
      {sub && <div className="font-mono text-[9px] text-[#2d5040]">{sub}</div>}
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

    const rsi = lastValidNum(ind.rsi);
    if (rsi != null) {
      out.push({ name: "RSI 14", value: rsi.toFixed(1),
        signal: rsi < 20 ? "strong-buy" : rsi < 30 ? "buy" : rsi > 80 ? "strong-sell" : rsi > 70 ? "sell" : "neutral",
        sub: rsi > 70 ? "OVERBOUGHT" : rsi < 30 ? "OVERSOLD" : "NEUTRAL ZONE" });
    }

    const macdV = lastValidNum(ind.macd?.macd);
    const sigV  = lastValidNum(ind.macd?.signal);
    const hist  = lastValidNum(ind.macd?.histogram);
    if (macdV != null && sigV != null) {
      out.push({ name: "MACD", value: macdV.toFixed(3),
        signal: macdV > sigV ? "buy" : macdV < sigV ? "sell" : "neutral",
        sub: hist != null ? `HIST ${hist > 0 ? "+" : ""}${hist.toFixed(3)}` : undefined });
    }

    const upper = lastValidNum(ind.bollinger?.upper);
    const lower = lastValidNum(ind.bollinger?.lower);
    const mid   = lastValidNum(ind.bollinger?.middle);
    if (upper != null && lower != null && mid != null) {
      const bw = ((upper - lower) / mid * 100).toFixed(1);
      const sig: Sig = close > upper ? "sell" : close < lower ? "strong-buy" : "neutral";
      out.push({ name: "BOLL", value: close > upper ? "ABOVE" : close < lower ? "BELOW" : "INSIDE",
        signal: sig, sub: `BW ${bw}%` });
    }

    const stochK = lastValidNum(ind.stochastic?.k);
    const stochD = lastValidNum(ind.stochastic?.d);
    if (stochK != null) {
      out.push({ name: "STOCH", value: stochK.toFixed(1),
        signal: stochK > 80 ? "sell" : stochK < 20 ? "buy" : "neutral",
        sub: stochD != null ? `%D ${stochD.toFixed(1)}` : undefined });
    }

    const adx = lastValidNum(ind.adx?.adx);
    const pdi = lastValidNum(ind.adx?.pdi);
    const mdi = lastValidNum(ind.adx?.mdi);
    if (adx != null && pdi != null && mdi != null) {
      out.push({ name: "ADX/DMI", value: adx.toFixed(1),
        signal: pdi > mdi ? "buy" : pdi < mdi ? "sell" : "neutral",
        sub: adx >= 25 ? "STRONG TREND" : "WEAK TREND" });
    }

    const cci = lastValidNum(ind.cci);
    if (cci != null) {
      out.push({ name: "CCI 20", value: cci.toFixed(0),
        signal: cci > 200 ? "strong-sell" : cci > 100 ? "sell" : cci < -200 ? "strong-buy" : cci < -100 ? "buy" : "neutral",
        sub: cci > 100 ? "OVERBOUGHT" : cci < -100 ? "OVERSOLD" : "NORMAL RANGE" });
    }

    return out;
  })();

  return (
    <div className="rounded border border-[#152b1e] bg-[#0a1610] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10px] text-[#00e87c] tracking-widest">// </span>
        <span className="font-mono text-xs font-bold text-[#c8edd8] tracking-wider">INDICATORS</span>
        <span className="font-mono text-[9px] text-[#2d5040] ml-1">3M</span>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 min-w-[130px] h-[76px] rounded border border-[#152b1e] bg-[#0f2218] animate-pulse" />
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
