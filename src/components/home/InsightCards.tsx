"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary, SignalValue } from "@/lib/market/indicators";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props { ticker: string }

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#182235] bg-[#0a1020] overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[#182235]">
        <span className="text-[#5a90b0] text-[8px]">◆</span>
        <span className="text-[11px] font-semibold text-[#d8e4f0] tracking-wide">{title}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-2.5 rounded bg-[#182235]" style={{ width: `${60 + (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────

const SIG_CFG: Record<SignalValue, { label: string; text: string; bg: string; border: string }> = {
  "strong-buy":  { label: "Strong Buy",  text: "text-[#7ab0cc]", bg: "bg-[#7ab0cc0a]", border: "border-[#7ab0cc33]" },
  "buy":         { label: "Buy",         text: "text-[#5a90b0]", bg: "bg-[#5a90b008]", border: "border-[#5a90b028]" },
  "neutral":     { label: "Neutral",     text: "text-[#7890a8]", bg: "bg-transparent", border: "border-[#243348]" },
  "sell":        { label: "Sell",        text: "text-[#aa6060]", bg: "bg-[#aa60600a]", border: "border-[#aa606028]" },
  "strong-sell": { label: "Strong Sell", text: "text-[#904848]", bg: "bg-[#9048480a]", border: "border-[#90484840]" },
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
    ? computeSignalSummary(indData.indicators, quote.price) : null;

  const overall: SignalValue = summary?.overall ?? "neutral";
  const cfg = SIG_CFG[overall];
  const total = summary ? summary.strongBuys + summary.buys + summary.neutrals + summary.sells + summary.strongSells : 0;
  const pct = (n: number) => total ? (n / total) * 100 : 0;

  return (
    <CardShell title="Signal Summary">
      {isLoading ? <Skeleton /> : summary ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#384e68] uppercase tracking-widest">Consensus</span>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", cfg.text, cfg.bg, cfg.border)}>
              {cfg.label}
            </span>
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-[#0e1628]">
            <div className="h-full flex">
              <div className="bg-[#7ab0cc]" style={{ width: `${pct(summary.strongBuys)}%` }} />
              <div className="bg-[#5a90b0]" style={{ width: `${pct(summary.buys)}%` }} />
              <div className="bg-[#1a2e48]" style={{ width: `${pct(summary.neutrals)}%` }} />
              <div className="bg-[#aa6060]" style={{ width: `${pct(summary.sells)}%` }} />
              <div className="bg-[#904848]" style={{ width: `${pct(summary.strongSells)}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#5a90b0]">{summary.strongBuys + summary.buys} Buy</span>
            <span className="text-[#384e68]">{summary.neutrals} Neutral</span>
            <span className="text-[#aa6060]">{summary.sells + summary.strongSells} Sell</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-2 border-t border-[#182235]">
            {summary.signals.slice(0, 6).map((s) => {
              const sc = SIG_CFG[s.signal];
              return (
                <span key={s.name} className={cn("text-[9px] px-1.5 py-0.5 rounded border", sc.text, sc.bg, sc.border)}>
                  {s.name}
                </span>
              );
            })}
          </div>
        </div>
      ) : <p className="text-[11px] text-[#384e68]">No data available</p>}
    </CardShell>
  );
}

// ── Quality Card ──────────────────────────────────────────────────────────────

interface QualityData { overall: number; profitability: number; growth: number; health: number; efficiency: number }

function qColor(v: number) { return v >= 70 ? "#5a90b0" : v >= 45 ? "#7890a8" : "#aa6060"; }
function qLabel(v: number) { return v >= 75 ? "Excellent" : v >= 60 ? "Good" : v >= 45 ? "Fair" : v >= 30 ? "Weak" : "Poor"; }

function MiniBar({ label, value }: { label: string; value: number }) {
  const color = qColor(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#7890a8] w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full overflow-hidden bg-[#0e1628]">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-mono w-6 text-right tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

export function QualityCard({ ticker }: Props) {
  const { data, isLoading } = useQuery<QualityData>({
    queryKey: ["quality", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/quality/${ticker}`); return r.json(); },
    staleTime: 15 * 60 * 1000,
  });
  const color = data ? qColor(data.overall) : "#384e68";
  return (
    <CardShell title="Business Quality">
      {isLoading ? <Skeleton lines={4} /> : data ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-2xl font-bold tabular-nums" style={{ color }}>{data.overall}</span>
              <span className="text-[10px] text-[#384e68] ml-1">/100</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color, background: `${color}0a`, borderColor: `${color}28` }}>
              {qLabel(data.overall)}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#182235]">
            <MiniBar label="Profitability" value={data.profitability} />
            <MiniBar label="Growth" value={data.growth} />
            <MiniBar label="Health" value={data.health} />
            <MiniBar label="Efficiency" value={data.efficiency} />
          </div>
        </div>
      ) : <p className="text-[11px] text-[#384e68]">No data available</p>}
    </CardShell>
  );
}

// ── Narrative Card ────────────────────────────────────────────────────────────

type Stage = "emerging" | "building" | "consensus" | "fading" | "unknown";
interface NarrativeData { stage: Stage; totalArticles: number; positive: number; neutral: number; negative: number }

const STAGE_CFG: Record<Stage, { label: string; desc: string; color: string; pos: number }> = {
  emerging:  { label: "Emerging",  desc: "Story forming",     color: "#5a90b0", pos: 0.12 },
  building:  { label: "Building",  desc: "Gaining traction",  color: "#7c9ed4", pos: 0.38 },
  consensus: { label: "Consensus", desc: "Widely known",      color: "#9d8ec0", pos: 0.65 },
  fading:    { label: "Fading",    desc: "Interest waning",   color: "#aa6060", pos: 0.88 },
  unknown:   { label: "Unknown",   desc: "Insufficient data", color: "#384e68", pos: 0.5  },
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
    <CardShell title="Narrative">
      {isLoading ? <Skeleton /> : data && cfg ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
              <p className="text-[10px] text-[#384e68] mt-0.5">{cfg.desc}</p>
            </div>
            <span className="text-[10px] text-[#384e68]">{data.totalArticles} articles</span>
          </div>
          <div className="relative py-1">
            <div className="h-0.5 rounded-full bg-[#182235]" />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#060a12] transition-all"
              style={{ left: `calc(${cfg.pos * 100}% - 5px)`, backgroundColor: cfg.color }}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-[#384e68]">
            <span>Emerging</span><span>Building</span><span>Consensus</span><span>Fading</span>
          </div>
          {total > 0 && (
            <div className="flex flex-col gap-1 pt-2 border-t border-[#182235]">
              <div className="h-1 rounded-full overflow-hidden bg-[#0e1628]">
                <div className="h-full flex">
                  <div className="bg-[#5a90b0]" style={{ width: `${posPct}%` }} />
                  <div className="bg-[#1a2e48]" style={{ width: `${neuPct}%` }} />
                  <div className="bg-[#aa6060]" style={{ width: `${negPct}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[#5a90b0]">{data.positive} pos</span>
                <span className="text-[#384e68]">{data.neutral} neu</span>
                <span className="text-[#aa6060]">{data.negative} neg</span>
              </div>
            </div>
          )}
        </div>
      ) : <p className="text-[11px] text-[#384e68]">No data available</p>}
    </CardShell>
  );
}

// ── Valuation Card ────────────────────────────────────────────────────────────

interface ValRange { min: number; max: number; current: number }
interface ValuationData { pe?: ValRange | null; ps?: ValRange | null; pfcf?: ValRange | null; pb?: ValRange | null }

function valPos(r: ValRange) {
  if (r.max === r.min) return 0.5;
  return Math.max(0, Math.min(1, (r.current - r.min) / (r.max - r.min)));
}
function valLabel(pos: number) {
  if (pos < 0.25) return { text: "Cheap", color: "#5a90b0" };
  if (pos < 0.55) return { text: "Fair",  color: "#7890a8" };
  return { text: "Rich", color: "#aa6060" };
}

function ValRow({ label, range }: { label: string; range: ValRange }) {
  const pos = valPos(range);
  const { text, color } = valLabel(pos);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#7890a8] w-10 shrink-0">{label}</span>
      <div className="relative flex-1 h-1 rounded-full bg-[#0e1628]">
        <div className="absolute inset-y-0 left-0 rounded-full opacity-20"
             style={{ width: `${pos * 100}%`, background: `linear-gradient(to right, #5a90b0, #aa6060)` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-[#060a12]"
             style={{ left: `calc(${pos * 100}% - 4px)`, backgroundColor: color }} />
      </div>
      <div className="flex items-center gap-1.5 w-20 justify-end">
        <span className="text-[9px] px-1 py-0.5 rounded" style={{ color, background: `${color}0a` }}>{text}</span>
        <span className="font-mono text-[10px] text-[#d8e4f0] tabular-nums">{range.current.toFixed(1)}x</span>
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
    <CardShell title="Valuation">
      {isLoading ? <Skeleton lines={4} /> : rows.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {rows.map(r => <ValRow key={r.label} {...r} />)}
          <p className="text-[9px] text-[#182235] pt-1 border-t border-[#182235]">Position within 5-year historical range</p>
        </div>
      ) : <p className="text-[11px] text-[#384e68]">No valuation data</p>}
    </CardShell>
  );
}

// ── Insider Card ──────────────────────────────────────────────────────────────

interface Transaction { name: string; relation: string; date: string; shares: number; value: number; isBuy: boolean }
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
    <CardShell title="Insider Activity">
      {isLoading ? <Skeleton lines={3} /> : txns.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between pb-2 border-b border-[#182235]">
            <span className="text-[10px] text-[#384e68]">Net {isNetBuy ? "buying" : "selling"}</span>
            <span className={cn("text-xs font-semibold font-mono flex items-center gap-1", isNetBuy ? "text-[#5a90b0]" : "text-[#aa6060]")}>
              {isNetBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isNetBuy ? "+" : ""}{fmtNum(net)}
            </span>
          </div>
          {txns.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={cn("mt-1 w-1 h-1 rounded-full shrink-0", t.isBuy ? "bg-[#5a90b0]" : "bg-[#aa6060]")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-medium text-[#d8e4f0] truncate">{t.name}</span>
                  <span className={cn("text-[9px] font-semibold shrink-0", t.isBuy ? "text-[#5a90b0]" : "text-[#aa6060]")}>
                    {t.isBuy ? "Buy" : "Sell"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-[#384e68]">
                  <span className="font-mono">{fmtNum(Math.abs(t.shares))} sh</span>
                  {t.date && <><span>·</span><span>{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-[11px] text-[#384e68]">No recent activity</p>}
    </CardShell>
  );
}
