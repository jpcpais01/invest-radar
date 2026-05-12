"use client";
import { useQuery } from "@tanstack/react-query";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { cn } from "@/lib/utils";

interface Props { ticker: string }
type Sig = "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";

const SIG_CLS: Record<Sig, string> = {
  "strong-buy":  "text-[#93c5fd] bg-[#93c5fd0a] border-[#93c5fd2a]",
  "buy":         "text-[#60a5fa] bg-[#60a5fa08] border-[#60a5fa22]",
  "neutral":     "text-[#7c7890] bg-transparent border-[#1a1a28]",
  "sell":        "text-[#e05252] bg-[#e052520a] border-[#e0525228]",
  "strong-sell": "text-[#d04444] bg-[#d044440a] border-[#d0444438]",
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
    <div className="flex-shrink-0 flex flex-col gap-2 rounded-lg border border-[#1a1a28] bg-[#0d0d15] px-4 py-3 min-w-[130px] hover:border-[#272738] transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold text-[#3a3748] uppercase tracking-widest">{name}</span>
        <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border", SIG_CLS[signal])}>
          {signal === "strong-buy" ? "S.Buy" : signal === "strong-sell" ? "S.Sell" : signal.charAt(0).toUpperCase() + signal.slice(1)}
        </span>
      </div>
      <div className="font-mono text-lg font-bold text-[#ede8e0] leading-none tabular-nums">{value}</div>
      {sub && <div className="text-[9px] text-[#3a3748]">{sub}</div>}
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
    if (rsi != null) out.push({ name: "RSI (14)", value: rsi.toFixed(1),
      signal: rsi < 20 ? "strong-buy" : rsi < 30 ? "buy" : rsi > 80 ? "strong-sell" : rsi > 70 ? "sell" : "neutral",
      sub: rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Neutral zone" });

    const macdV = lastValidNum(ind.macd?.macd);
    const sigV  = lastValidNum(ind.macd?.signal);
    const hist  = lastValidNum(ind.macd?.histogram);
    if (macdV != null && sigV != null) out.push({ name: "MACD", value: macdV.toFixed(3),
      signal: macdV > sigV ? "buy" : macdV < sigV ? "sell" : "neutral",
      sub: hist != null ? `Hist ${hist > 0 ? "+" : ""}${hist.toFixed(3)}` : undefined });

    const upper = lastValidNum(ind.bollinger?.upper);
    const lower = lastValidNum(ind.bollinger?.lower);
    const mid   = lastValidNum(ind.bollinger?.middle);
    if (upper != null && lower != null && mid != null) {
      const bw = ((upper - lower) / mid * 100).toFixed(1);
      out.push({ name: "Bollinger", value: close > upper ? "Above" : close < lower ? "Below" : "Inside",
        signal: close > upper ? "sell" : close < lower ? "strong-buy" : "neutral", sub: `BW ${bw}%` });
    }

    const stochK = lastValidNum(ind.stochastic?.k);
    const stochD = lastValidNum(ind.stochastic?.d);
    if (stochK != null) out.push({ name: "Stochastic", value: stochK.toFixed(1),
      signal: stochK > 80 ? "sell" : stochK < 20 ? "buy" : "neutral",
      sub: stochD != null ? `%D ${stochD.toFixed(1)}` : undefined });

    const adx = lastValidNum(ind.adx?.adx);
    const pdi = lastValidNum(ind.adx?.pdi);
    const mdi = lastValidNum(ind.adx?.mdi);
    if (adx != null && pdi != null && mdi != null) out.push({ name: "ADX / DMI", value: adx.toFixed(1),
      signal: pdi > mdi ? "buy" : pdi < mdi ? "sell" : "neutral",
      sub: adx >= 25 ? "Strong trend" : "Weak trend" });

    const cci = lastValidNum(ind.cci);
    if (cci != null) out.push({ name: "CCI (20)", value: cci.toFixed(0),
      signal: cci > 200 ? "strong-sell" : cci > 100 ? "sell" : cci < -200 ? "strong-buy" : cci < -100 ? "buy" : "neutral",
      sub: cci > 100 ? "Overbought" : cci < -100 ? "Oversold" : "Normal range" });

    return out;
  })();

  return (
    <div className="rounded-lg border border-[#1a1a28] bg-[#0d0d15] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[#60a5fa] text-[8px]">◆</span>
        <span className="text-[11px] font-semibold text-[#ede8e0] tracking-wide">Technical Indicators</span>
        <span className="text-[9px] text-[#3a3748] ml-1">3M</span>
      </div>
      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 min-w-[130px] h-[76px] rounded-lg bg-[#12121c] animate-pulse" />
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
