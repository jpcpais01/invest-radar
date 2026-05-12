"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary, SignalValue } from "@/lib/market/indicators";
import { TrendingUp, TrendingDown, Minus, Activity, BarChart3, Newspaper, DollarSign, Users } from "lucide-react";

interface Props { ticker: string }

// ── Shared helpers ────────────────────────────────────────────────────────────

function CardShell({ icon, title, children, accent }: { icon: React.ReactNode; title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-[#21262d] bg-[#161b22] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#21262d]">
        <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0", accent ?? "bg-[#21262d]")}>
          {icon}
        </div>
        <span className="text-xs font-bold text-white">{title}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-[#21262d]" style={{ width: `${60 + (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────

const SIG_CFG: Record<SignalValue, { label: string; text: string; bg: string; border: string }> = {
  "strong-buy":  { label: "Strong Buy",  text: "text-[#3fb950]", bg: "bg-[#3fb95018]", border: "border-[#3fb95044]" },
  "buy":         { label: "Buy",         text: "text-[#56d364]", bg: "bg-[#56d36412]", border: "border-[#56d36438]" },
  "neutral":     { label: "Neutral",     text: "text-[#8b949e]", bg: "bg-transparent", border: "border-[#30363d]" },
  "sell":        { label: "Sell",        text: "text-[#ff7b72]", bg: "bg-[#ff7b7212]", border: "border-[#ff7b7238]" },
  "strong-sell": { label: "Strong Sell", text: "text-[#f85149]", bg: "bg-[#f8514918]", border: "border-[#f8514948]" },
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
    <CardShell icon={<Activity className="w-3.5 h-3.5 text-[#388bfd]" />} title="Signal Summary" accent="bg-[#1f6feb22]">
      {isLoading ? <Skeleton /> : summary ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#8b949e] uppercase tracking-widest font-semibold">Overall</span>
            <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border", cfg.text, cfg.bg, cfg.border)}>
              {cfg.label}
            </span>
          </div>
          {/* Buy/Sell bar */}
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            <div className="bg-[#3fb950] rounded-l-full transition-all" style={{ width: `${pct(summary.strongBuys)}%` }} />
            <div className="bg-[#56d364] transition-all" style={{ width: `${pct(summary.buys)}%` }} />
            <div className="bg-[#484f58] transition-all" style={{ width: `${pct(summary.neutrals)}%` }} />
            <div className="bg-[#ff7b72] transition-all" style={{ width: `${pct(summary.sells)}%` }} />
            <div className="bg-[#f85149] rounded-r-full transition-all" style={{ width: `${pct(summary.strongSells)}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#3fb950] font-semibold">{summary.strongBuys + summary.buys} Buy</span>
            <span className="text-[#484f58]">{summary.neutrals} Neutral</span>
            <span className="text-[#f85149] font-semibold">{summary.sells + summary.strongSells} Sell</span>
          </div>
          {/* Individual signals */}
          <div className="flex flex-wrap gap-1 pt-1 border-t border-[#21262d]">
            {summary.signals.slice(0, 6).map((s) => {
              const sc = SIG_CFG[s.signal];
              return (
                <span key={s.name} className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide", sc.text, sc.bg, sc.border)}>
                  {s.name}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-[#484f58]">No data available</p>
      )}
    </CardShell>
  );
}

// ── Quality Card ──────────────────────────────────────────────────────────────

interface QualityData { overall: number; profitability: number; growth: number; health: number; efficiency: number }

function scoreColor(v: number) { return v >= 70 ? "#3fb950" : v >= 45 ? "#d29922" : "#f85149"; }
function scoreLabel(v: number) { return v >= 75 ? "Excellent" : v >= 60 ? "Good" : v >= 45 ? "Fair" : v >= 30 ? "Weak" : "Poor"; }

function MiniBar({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#8b949e] w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#21262d] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-mono w-6 text-right" style={{ color }}>{value}</span>
    </div>
  );
}

export function QualityCard({ ticker }: Props) {
  const { data, isLoading } = useQuery<QualityData>({
    queryKey: ["quality", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/quality/${ticker}`); return r.json(); },
    staleTime: 15 * 60 * 1000,
  });

  const color = data ? scoreColor(data.overall) : "#484f58";

  return (
    <CardShell icon={<BarChart3 className="w-3.5 h-3.5 text-[#d29922]" />} title="Business Quality" accent="bg-[#d2992218]">
      {isLoading ? <Skeleton lines={4} /> : data ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-black" style={{ color }}>{data.overall}</span>
              <span className="text-[10px] text-[#8b949e] ml-1">/100</span>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full border" style={{ color, background: `${color}18`, borderColor: `${color}44` }}>
              {scoreLabel(data.overall)}
            </span>
          </div>
          <div className="flex flex-col gap-2 pt-1 border-t border-[#21262d]">
            <MiniBar label="Profitability" value={data.profitability} />
            <MiniBar label="Growth" value={data.growth} />
            <MiniBar label="Health" value={data.health} />
            <MiniBar label="Efficiency" value={data.efficiency} />
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-[#484f58]">No data available</p>
      )}
    </CardShell>
  );
}

// ── Narrative Card ────────────────────────────────────────────────────────────

type Stage = "emerging" | "building" | "consensus" | "fading" | "unknown";
interface NarrativeData { stage: Stage; totalArticles: number; positive: number; neutral: number; negative: number }

const STAGE_CFG: Record<Stage, { label: string; desc: string; color: string; pos: number }> = {
  emerging:  { label: "Emerging",  desc: "Story forming",     color: "#3fb950", pos: 0.12 },
  building:  { label: "Building",  desc: "Gaining traction",  color: "#58a6ff", pos: 0.38 },
  consensus: { label: "Consensus", desc: "Widely known",      color: "#d29922", pos: 0.65 },
  fading:    { label: "Fading",    desc: "Interest waning",   color: "#f85149", pos: 0.88 },
  unknown:   { label: "Unknown",   desc: "Insufficient data", color: "#484f58", pos: 0.5  },
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
    <CardShell icon={<Newspaper className="w-3.5 h-3.5 text-[#58a6ff]" />} title="Narrative Maturity" accent="bg-[#58a6ff18]">
      {isLoading ? <Skeleton /> : data && cfg ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
              <p className="text-[10px] text-[#484f58]">{cfg.desc}</p>
            </div>
            <span className="text-[10px] text-[#8b949e]">{data.totalArticles} articles</span>
          </div>
          {/* Stage track */}
          <div className="relative">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-[#3fb950] via-[#58a6ff] via-[#d29922] to-[#f85149] opacity-30" />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[#0d1117] transition-all"
              style={{ left: `calc(${cfg.pos * 100}% - 6px)`, backgroundColor: cfg.color }}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-[#484f58] -mt-1">
            <span>Emerging</span><span>Building</span><span>Consensus</span><span>Fading</span>
          </div>
          {/* Sentiment bar */}
          {total > 0 && (
            <div className="flex flex-col gap-1 pt-1 border-t border-[#21262d]">
              <div className="flex h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#3fb950]" style={{ width: `${posPct}%` }} />
                <div className="bg-[#484f58]" style={{ width: `${neuPct}%` }} />
                <div className="bg-[#f85149]" style={{ width: `${negPct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[#3fb950]">{data.positive} pos</span>
                <span className="text-[#484f58]">{data.neutral} neu</span>
                <span className="text-[#f85149]">{data.negative} neg</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-[#484f58]">No data available</p>
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
  if (pos < 0.25) return { text: "Cheap", color: "#3fb950" };
  if (pos < 0.55) return { text: "Fair",  color: "#d29922" };
  return { text: "Rich", color: "#f85149" };
}

function ValRow({ label, range }: { label: string; range: ValRange }) {
  const pos = valPos(range);
  const { text, color } = valLabel(pos);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#8b949e] w-10 shrink-0">{label}</span>
      <div className="relative flex-1 h-1.5 rounded-full bg-[#21262d]">
        <div
          className="absolute inset-y-0 left-0 rounded-full opacity-30"
          style={{ width: `${pos * 100}%`, background: "linear-gradient(to right, #3fb950, #d29922, #f85149)" }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#161b22]"
          style={{ left: `calc(${pos * 100}% - 5px)`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center gap-1.5 w-20 justify-end">
        <span className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ color, background: `${color}18` }}>{text}</span>
        <span className="text-[10px] font-mono text-[#e6edf3]">{range.current.toFixed(1)}x</span>
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
    <CardShell icon={<DollarSign className="w-3.5 h-3.5 text-[#3fb950]" />} title="Valuation Context" accent="bg-[#3fb95018]">
      {isLoading ? <Skeleton lines={4} /> : rows.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {rows.map(r => <ValRow key={r.label} {...r} />)}
          <p className="text-[9px] text-[#30363d] pt-1 border-t border-[#21262d]">Position within 5-year historical range</p>
        </div>
      ) : (
        <p className="text-[11px] text-[#484f58]">No valuation data available</p>
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
    <CardShell icon={<Users className="w-3.5 h-3.5 text-[#a78bfa]" />} title="Insider Activity" accent="bg-[#a78bfa18]">
      {isLoading ? <Skeleton lines={3} /> : txns.length > 0 ? (
        <div className="flex flex-col gap-2">
          {/* Net sentiment */}
          <div className="flex items-center justify-between pb-2 border-b border-[#21262d]">
            <span className="text-[10px] text-[#8b949e]">Net {isNetBuy ? "buying" : "selling"}</span>
            <span className={cn("text-xs font-bold flex items-center gap-1", isNetBuy ? "text-[#3fb950]" : "text-[#f85149]")}>
              {isNetBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isNetBuy ? "+" : ""}{fmtNum(net)} shares
            </span>
          </div>
          {/* Transactions */}
          {txns.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={cn("mt-0.5 w-1.5 h-1.5 rounded-full shrink-0", t.isBuy ? "bg-[#3fb950]" : "bg-[#f85149]")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-semibold text-white truncate">{t.name}</span>
                  <span className={cn("text-[9px] font-bold shrink-0", t.isBuy ? "text-[#3fb950]" : "text-[#f85149]")}>
                    {t.isBuy ? "Buy" : "Sell"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-[#484f58]">
                  <span>{t.relation}</span>
                  <span>·</span>
                  <span>{fmtNum(Math.abs(t.shares))} shares</span>
                  {t.date && <><span>·</span><span>{new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-[#484f58]">No recent insider activity</p>
      )}
    </CardShell>
  );
}
