"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary, SignalValue } from "@/lib/market/indicators";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props { ticker: string }

// ── Shared helpers ────────────────────────────────────────────────────────────

function CardShell({ prefix, title, children }: { prefix: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-[#152b1e] bg-[#0a1610] overflow-hidden hover:border-[#1e4030] transition-colors">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#152b1e]">
        <span className="font-mono text-[10px] text-[#00e87c] tracking-widest shrink-0">{prefix}</span>
        <span className="font-mono text-[11px] font-bold text-[#c8edd8] tracking-wider uppercase">{title}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-2.5 rounded bg-[#152b1e]" style={{ width: `${60 + (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────

const SIG_CFG: Record<SignalValue, { label: string; text: string; bg: string; border: string }> = {
  "strong-buy":  { label: "STRONG BUY",  text: "text-[#00ff8a]", bg: "bg-[#00ff8a0e]", border: "border-[#00ff8a33]" },
  "buy":         { label: "BUY",         text: "text-[#00e87c]", bg: "bg-[#00e87c0a]", border: "border-[#00e87c28]" },
  "neutral":     { label: "NEUTRAL",     text: "text-[#5a9e7a]", bg: "bg-transparent", border: "border-[#152b1e]" },
  "sell":        { label: "SELL",        text: "text-[#ff4545]", bg: "bg-[#ff45450a]", border: "border-[#ff454530]" },
  "strong-sell": { label: "STRONG SELL", text: "text-[#ff2020]", bg: "bg-[#ff20200e]", border: "border-[#ff202040]" },
};

export function SignalCard({ ticker }: Props) {
  const { data: indData, isLoading } = useQuery({
    queryKey: ["history-indicators", ticker, "3M"],
    queryFn: async () => {
      const r = await fetch(`/api/market/history/${ticker}?tf=3M&indicators=true`);
      return r.json() as Promise<{ bars: OHLCVBar[]; indicators: TechnicalIndicators }>;
    },
    staleTime: 60000,
  });

  const { data: quote } = useQuery({
    queryKey: ["quote", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/quote/${ticker}`); return r.json(); },
    refetchInterval: 30000,
  });

  const summary = indData?.indicators && quote?.price
    ? computeSignalSummary(indData.indicators, quote.price)
    : null;

  const overall: SignalValue = summary?.overall ?? "neutral";
  const cfg = SIG_CFG[overall];
  const total = summary ? summary.strongBuys + summary.buys + summary.neutrals + summary.sells + summary.strongSells : 0;
  const pct = (n: number) => total ? (n / total) * 100 : 0;

  return (
    <CardShell prefix="// " title="Signal Summary">
      {isLoading ? <Skeleton /> : summary ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-[#2d5040] uppercase tracking-widest">OVERALL</span>
            <span className={cn("font-mono text-[10px] font-bold px-2 py-0.5 rounded border tracking-widest", cfg.text, cfg.bg, cfg.border)}>
              {cfg.label}
            </span>
          </div>
          <div className="flex h-1.5 rounded-sm overflow-hidden" style={{ background: "#0f2218" }}>
            <div className="bg-[#00ff8a] transition-all" style={{ width: `${pct(summary.strongBuys)}%` }} />
            <div className="bg-[#00e87c] transition-all" style={{ width: `${pct(summary.buys)}%` }} />
            <div className="bg-[#2d5040] transition-all" style={{ width: `${pct(summary.neutrals)}%` }} />
            <div className="bg-[#ff4545] transition-all" style={{ width: `${pct(summary.sells)}%` }} />
            <div className="bg-[#ff2020] transition-all" style={{ width: `${pct(summary.strongSells)}%` }} />
          </div>
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-[#00e87c] font-bold">{summary.strongBuys + summary.buys} BUY</span>
            <span className="text-[#2d5040]">{summary.neutrals} NEU</span>
            <span className="text-[#ff4545] font-bold">{summary.sells + summary.strongSells} SELL</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1 border-t border-[#152b1e]">
            {summary.signals.slice(0, 6).map((s) => {
              const sc = SIG_CFG[s.signal];
              return (
                <span key={s.name} className={cn("font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide", sc.text, sc.bg, sc.border)}>
                  {s.name}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="font-mono text-[10px] text-[#2d5040]">NO DATA</p>
      )}
    </CardShell>
  );
}

// ── Quality Card ──────────────────────────────────────────────────────────────

interface QualityData { overall: number; profitability: number; growth: number; health: number; efficiency: number }

function scoreColor(v: number) { return v >= 70 ? "#00e87c" : v >= 45 ? "#d4a012" : "#ff4545"; }
function scoreLabel(v: number) { return v >= 75 ? "EXCELLENT" : v >= 60 ? "GOOD" : v >= 45 ? "FAIR" : v >= 30 ? "WEAK" : "POOR"; }

function MiniBar({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] text-[#5a9e7a] w-20 shrink-0 uppercase tracking-wide">{label}</span>
      <div className="flex-1 h-1 rounded-sm overflow-hidden" style={{ background: "#0f2218" }}>
        <div className="h-full rounded-sm transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono text-[9px] w-6 text-right tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

export function QualityCard({ ticker }: Props) {
  const { data, isLoading } = useQuery<QualityData>({
    queryKey: ["quality", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/quality/${ticker}`); return r.json(); },
    staleTime: 15 * 60 * 1000,
  });

  const color = data ? scoreColor(data.overall) : "#2d5040";

  return (
    <CardShell prefix="// " title="Business Quality">
      {isLoading ? <Skeleton lines={4} /> : data ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-2xl font-black tabular-nums" style={{ color }}>{data.overall}</span>
              <span className="font-mono text-[9px] text-[#2d5040] ml-1">/100</span>
            </div>
            <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded border" style={{ color, background: `${color}0e`, borderColor: `${color}33` }}>
              {scoreLabel(data.overall)}
            </span>
          </div>
          <div className="flex flex-col gap-2 pt-1 border-t border-[#152b1e]">
            <MiniBar label="Profit" value={data.profitability} />
            <MiniBar label="Growth" value={data.growth} />
            <MiniBar label="Health" value={data.health} />
            <MiniBar label="Effic" value={data.efficiency} />
          </div>
        </div>
      ) : (
        <p className="font-mono text-[10px] text-[#2d5040]">NO DATA</p>
      )}
    </CardShell>
  );
}

// ── Narrative Card ────────────────────────────────────────────────────────────

type Stage = "emerging" | "building" | "consensus" | "fading" | "unknown";
interface NarrativeData { stage: Stage; totalArticles: number; positive: number; neutral: number; negative: number }

const STAGE_CFG: Record<Stage, { label: string; desc: string; color: string; pos: number }> = {
  emerging:  { label: "EMERGING",  desc: "Story forming",     color: "#00e87c", pos: 0.12 },
  building:  { label: "BUILDING",  desc: "Gaining traction",  color: "#3090ff", pos: 0.38 },
  consensus: { label: "CONSENSUS", desc: "Widely known",      color: "#d4a012", pos: 0.65 },
  fading:    { label: "FADING",    desc: "Interest waning",   color: "#ff4545", pos: 0.88 },
  unknown:   { label: "UNKNOWN",   desc: "Insufficient data", color: "#2d5040", pos: 0.5  },
};

export function NarrativeCard({ ticker }: Props) {
  const { data, isLoading } = useQuery<NarrativeData>({
    queryKey: ["narrative", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/narrative/${ticker}`); return r.json(); },
    staleTime: 15 * 60 * 1000,
  });

  const cfg = data ? STAGE_CFG[data.stage] : null;
  const total = data ? data.positive + data.neutral + data.negative : 0;
  const posPct = total ? (data!.positive / total) * 100 : 0;
  const negPct = total ? (data!.negative / total) * 100 : 0;
  const neuPct = total ? (data!.neutral / total) * 100 : 0;

  return (
    <CardShell prefix="// " title="Narrative">
      {isLoading ? <Skeleton /> : data && cfg ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
              <p className="font-mono text-[9px] text-[#2d5040] mt-0.5">{cfg.desc}</p>
            </div>
            <span className="font-mono text-[9px] text-[#2d5040]">{data.totalArticles} ART</span>
          </div>
          <div className="relative">
            <div className="h-1 rounded-sm" style={{ background: "linear-gradient(to right, #00e87c, #3090ff, #d4a012, #ff4545)", opacity: 0.25 }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#060d09] transition-all"
              style={{ left: `calc(${cfg.pos * 100}% - 5px)`, backgroundColor: cfg.color, boxShadow: `0 0 8px ${cfg.color}88` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[8px] text-[#2d5040] -mt-1 uppercase tracking-wide">
            <span>Emerging</span><span>Building</span><span>Consensus</span><span>Fading</span>
          </div>
          {total > 0 && (
            <div className="flex flex-col gap-1 pt-1 border-t border-[#152b1e]">
              <div className="flex h-1 rounded-sm overflow-hidden" style={{ background: "#0f2218" }}>
                <div className="bg-[#00e87c]" style={{ width: `${posPct}%` }} />
                <div className="bg-[#2d5040]" style={{ width: `${neuPct}%` }} />
                <div className="bg-[#ff4545]" style={{ width: `${negPct}%` }} />
              </div>
              <div className="flex items-center justify-between font-mono text-[9px]">
                <span className="text-[#00e87c]">{data.positive} POS</span>
                <span className="text-[#2d5040]">{data.neutral} NEU</span>
                <span className="text-[#ff4545]">{data.negative} NEG</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="font-mono text-[10px] text-[#2d5040]">NO DATA</p>
      )}
    </CardShell>
  );
}

// ── Valuation Card ────────────────────────────────────────────────────────────

interface ValRange { min: number; max: number; current: number }
interface ValuationData { pe?: ValRange | null; ps?: ValRange | null; pfcf?: ValRange | null; pb?: ValRange | null }

function valPos(range: ValRange) {
  if (range.max === range.min) return 0.5;
  return Math.max(0, Math.min(1, (range.current - range.min) / (range.max - range.min)));
}

function valLabel(pos: number) {
  if (pos < 0.25) return { text: "CHEAP", color: "#00e87c" };
  if (pos < 0.55) return { text: "FAIR",  color: "#d4a012" };
  return { text: "RICH", color: "#ff4545" };
}

function ValRow({ label, range }: { label: string; range: ValRange }) {
  const pos = valPos(range);
  const { text, color } = valLabel(pos);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] text-[#5a9e7a] w-10 shrink-0 uppercase">{label}</span>
      <div className="relative flex-1 h-1 rounded-sm" style={{ background: "#0f2218" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-sm opacity-25"
          style={{ width: `${pos * 100}%`, background: "linear-gradient(to right, #00e87c, #d4a012, #ff4545)" }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-[#060d09]"
          style={{ left: `calc(${pos * 100}% - 4px)`, backgroundColor: color, boxShadow: `0 0 6px ${color}88` }}
        />
      </div>
      <div className="flex items-center gap-1.5 w-20 justify-end">
        <span className="font-mono text-[8px] font-bold px-1 py-0.5 rounded" style={{ color, background: `${color}12` }}>{text}</span>
        <span className="font-mono text-[10px] text-[#c8edd8] tabular-nums">{range.current.toFixed(1)}x</span>
      </div>
    </div>
  );
}

export function ValuationCard({ ticker }: Props) {
  const { data, isLoading } = useQuery<ValuationData>({
    queryKey: ["valuation", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/valuation/${ticker}`); return r.json(); },
    staleTime: 15 * 60 * 1000,
  });

  const rows = data ? [
    data.pe   ? { label: "P/E",   range: data.pe }   : null,
    data.ps   ? { label: "P/S",   range: data.ps }   : null,
    data.pfcf ? { label: "P/FCF", range: data.pfcf } : null,
    data.pb   ? { label: "P/B",   range: data.pb }   : null,
  ].filter(Boolean) as { label: string; range: ValRange }[] : [];

  return (
    <CardShell prefix="// " title="Valuation">
      {isLoading ? <Skeleton lines={4} /> : rows.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {rows.map(r => <ValRow key={r.label} {...r} />)}
          <p className="font-mono text-[8px] text-[#152b1e] pt-1 border-t border-[#152b1e]">POSITION WITHIN 5-YEAR HISTORICAL RANGE</p>
        </div>
      ) : (
        <p className="font-mono text-[10px] text-[#2d5040]">NO DATA</p>
      )}
    </CardShell>
  );
}

// ── Insider Card ──────────────────────────────────────────────────────────────

interface Transaction { name: string; relation: string; text: string; date: string; shares: number; value: number; isBuy: boolean }
interface InsiderData { transactions: Transaction[]; netShares: number }

function fmtNum(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function InsiderCard({ ticker }: Props) {
  const { data, isLoading } = useQuery<InsiderData>({
    queryKey: ["insiders", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/insiders/${ticker}`); return r.json(); },
    staleTime: 60 * 60 * 1000,
  });

  const txns = data?.transactions?.slice(0, 4) ?? [];
  const net = data?.netShares ?? 0;
  const isNetBuy = net >= 0;

  return (
    <CardShell prefix="// " title="Insiders">
      {isLoading ? <Skeleton lines={3} /> : txns.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between pb-2 border-b border-[#152b1e]">
            <span className="font-mono text-[9px] text-[#2d5040] uppercase tracking-wide">NET FLOW</span>
            <span className={cn("font-mono text-[11px] font-bold flex items-center gap-1", isNetBuy ? "text-[#00e87c]" : "text-[#ff4545]")}>
              {isNetBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isNetBuy ? "+" : ""}{fmtNum(net)}
            </span>
          </div>
          {txns.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={cn("mt-0.5 w-1.5 h-1.5 rounded-sm shrink-0", t.isBuy ? "bg-[#00e87c]" : "bg-[#ff4545]")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[10px] font-bold text-[#c8edd8] truncate">{t.name}</span>
                  <span className={cn("font-mono text-[9px] font-bold shrink-0", t.isBuy ? "text-[#00e87c]" : "text-[#ff4545]")}>
                    {t.isBuy ? "BUY" : "SELL"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[8px] text-[#2d5040]">
                  <span>{fmtNum(Math.abs(t.shares))} SH</span>
                  {t.date && <><span>·</span><span>{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="font-mono text-[10px] text-[#2d5040]">NO RECENT ACTIVITY</p>
      )}
    </CardShell>
  );
}
