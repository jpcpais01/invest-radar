"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Globe, Users, MapPin, ExternalLink, PieChart, BarChart3 } from "lucide-react";
import { Fundamentals, EtfProfile } from "@/types/market";

interface Props { ticker: string }

/* ── shared helpers ─────────────────────────────────────────── */

function fmtPct(n: number, decimals = 2) {
  return `${(n * 100).toFixed(decimals)}%`;
}
function fmtEmployees(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
function fmtAum(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

const EXCHANGE_LABELS: Record<string, string> = {
  NMS: "NASDAQ", NGM: "NASDAQ", NNM: "NASDAQ",
  NYQ: "NYSE",   NYA: "NYSE",
  PCX: "NYSE Arca",
  ASE: "AMEX",
  BTS: "BATS",
};

// palette for sector bar segments
const SECTOR_COLORS = [
  "#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#f87171",
  "#38bdf8", "#c084fc", "#4ade80", "#fb923c", "#e879f9",
  "#22d3ee", "#a3e635",
];

/* ── skeleton ────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="space-y-1.5 mb-3">
      {[100, 92, 78, 60].map((w, i) => (
        <div key={i} className="h-3 rounded animate-pulse bg-[#1a1a1a]" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/* ── ETF view ────────────────────────────────────────────────── */
function EtfView({ data }: { data: EtfProfile }) {
  const [showAll, setShowAll] = useState(false);
  const holdings = showAll ? data.holdings : data.holdings.slice(0, 10);

  return (
    <>
      {/* Asset-class breakdown pills */}
      {(data.stockPct != null || data.bondPct != null || data.cashPct != null) && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {data.stockPct != null && (
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border bg-[#4ade8010] border-[#4ade8030] text-[#4ade80]">
              Stocks {fmtPct(data.stockPct, 1)}
            </span>
          )}
          {data.bondPct != null && data.bondPct > 0 && (
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border bg-[#60a5fa10] border-[#60a5fa30] text-[#60a5fa]">
              Bonds {fmtPct(data.bondPct, 1)}
            </span>
          )}
          {data.cashPct != null && data.cashPct > 0 && (
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border bg-[#ffffff08] border-[#2c2c2c] text-[#767676]">
              Cash {fmtPct(data.cashPct, 1)}
            </span>
          )}
        </div>
      )}

      {/* Sector weights */}
      {data.sectorWeights.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <PieChart className="w-3 h-3 text-[#686868]" />
            <span className="text-[9px] uppercase tracking-widest font-semibold text-[#686868]">Sector Allocation</span>
          </div>

          {/* Stacked bar */}
          <div className="flex h-2 rounded-full overflow-hidden mb-2.5 gap-px">
            {data.sectorWeights.map((s, i) => (
              <div
                key={s.sector}
                style={{ width: fmtPct(s.weight, 4), background: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                title={`${s.sector}: ${fmtPct(s.weight)}`}
              />
            ))}
          </div>

          {/* Legend rows */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {data.sectorWeights.map((s, i) => (
              <div key={s.sector} className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                  <span className="text-[10px] text-[#767676] truncate">{s.sector}</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-[#c8c8e0] shrink-0">{fmtPct(s.weight, 1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top holdings */}
      {data.holdings.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 className="w-3 h-3 text-[#686868]" />
            <span className="text-[9px] uppercase tracking-widest font-semibold text-[#686868]">Top Holdings</span>
            <span className="ml-auto text-[9px] text-[#5a5a5a]">{data.holdings.length} positions</span>
          </div>

          <div className="space-y-1.5">
            {holdings.map((h) => {
              const barW = Math.min(100, h.weight * 100 / (data.holdings[0]?.weight || 1) * 100);
              return (
                <div key={h.name} className="flex items-center gap-2">
                  {/* Bar */}
                  <div className="flex-1 min-w-0 relative">
                    <div
                      className="absolute inset-y-0 left-0 rounded-sm"
                      style={{ width: `${barW}%`, background: "rgba(192,192,204,0.07)" }}
                    />
                    <div className="relative flex items-center justify-between px-2 py-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {h.symbol && (
                          <span className="text-[10px] font-bold font-mono text-[#c0c0cc] shrink-0">{h.symbol}</span>
                        )}
                        <span className="text-[10px] text-[#4a4a4a] truncate">{h.name}</span>
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-[#c8c8e0] shrink-0 ml-2">
                        {fmtPct(h.weight, 2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {data.holdings.length > 10 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="mt-2 text-[10px] font-medium text-[#c0c0cc60] hover:text-[#c0c0cc] transition-colors"
            >
              {showAll ? `Show top 10` : `Show all ${data.holdings.length} holdings`}
            </button>
          )}
        </div>
      )}

      {/* Key stats strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-3 border-t border-[#161616]">
        {data.aum != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-widest text-[#5a5a5a] font-medium">AUM</span>
            <span className="text-[11px] font-semibold font-mono text-[#c8c8e0]">{fmtAum(data.aum)}</span>
          </div>
        )}
        {data.expenseRatio != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-widest text-[#5a5a5a] font-medium">Expense Ratio</span>
            <span className="text-[11px] font-semibold font-mono text-[#c8c8e0]">{fmtPct(data.expenseRatio, 2)}</span>
          </div>
        )}
        {data.exchange && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-widest text-[#5a5a5a] font-medium">Exchange</span>
            <span className="text-[11px] font-semibold text-[#c8c8e0]">
              {EXCHANGE_LABELS[data.exchange] ?? data.exchange}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Stock / equity view ─────────────────────────────────────── */
function StockView({ data }: { data: Fundamentals }) {
  const [expanded, setExpanded] = useState(false);
  const desc = data.description ?? "";
  const SHORT_LIMIT = 280;
  const isLong = desc.length > SHORT_LIMIT;
  const displayDesc = isLong && !expanded ? desc.slice(0, SHORT_LIMIT).trimEnd() + "…" : desc;
  const exchangeLabel = data.exchange ? (EXCHANGE_LABELS[data.exchange] ?? data.exchange) : null;

  return (
    <>
      {/* Sector / Industry pills */}
      {(data.sector || data.industry) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {data.sector && (
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border border-[#c0c0cc1a] bg-[#c0c0cc08] text-[#c0c0cc80] uppercase tracking-wide">
              {data.sector}
            </span>
          )}
          {data.industry && data.industry !== data.sector && (
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border border-[#2c2c2c] bg-[#ffffff05] text-[#4a4a4a] uppercase tracking-wide">
              {data.industry}
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {desc ? (
        <div className="mb-3">
          <p className="text-[11.5px] leading-relaxed text-[#7a7a8a]">{displayDesc}</p>
          {isLong && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-1.5 text-[10px] font-medium text-[#c0c0cc60] hover:text-[#c0c0cc] transition-colors"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-[#5a5a5a] mb-3">No description available.</p>
      )}

      {/* Quick-facts strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-3 border-t border-[#161616]">
        {data.marketCap != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-widest text-[#5a5a5a] font-medium">Mkt Cap</span>
            <span className="text-[11px] font-semibold font-mono text-[#c8c8e0]">{fmtAum(data.marketCap)}</span>
          </div>
        )}
        {data.employees != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-widest text-[#5a5a5a] font-medium flex items-center gap-1">
              <Users className="w-2.5 h-2.5" />Employees
            </span>
            <span className="text-[11px] font-semibold font-mono text-[#c8c8e0]">{fmtEmployees(data.employees)}</span>
          </div>
        )}
        {data.country && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-widest text-[#5a5a5a] font-medium flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" />HQ
            </span>
            <span className="text-[11px] font-semibold text-[#c8c8e0]">{data.country}</span>
          </div>
        )}
        {exchangeLabel && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-widest text-[#5a5a5a] font-medium">Exchange</span>
            <span className="text-[11px] font-semibold text-[#c8c8e0]">{exchangeLabel}</span>
          </div>
        )}
        {data.website && (
          <div className="flex flex-col gap-0.5 ml-auto">
            <span className="text-[8px] uppercase tracking-widest text-[#5a5a5a] font-medium flex items-center gap-1">
              <Globe className="w-2.5 h-2.5" />Website
            </span>
            <a
              href={data.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#60a5fa80] hover:text-[#60a5fa] transition-colors"
            >
              {hostOf(data.website)}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Main card ───────────────────────────────────────────────── */
export default function CompanyAboutCard({ ticker }: Props) {
  // Always fetch fundamentals — it tells us quoteType + stock data
  const { data: fund, isLoading: fundLoading } = useQuery<Fundamentals>({
    queryKey: ["fundamentals", ticker],
    queryFn: () => fetch(`/api/market/fundamentals/${encodeURIComponent(ticker)}`).then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const isEtf = fund?.quoteType === "ETF" || fund?.quoteType === "MUTUALFUND";

  // Conditionally fetch ETF profile
  const { data: etf, isLoading: etfLoading } = useQuery<EtfProfile>({
    queryKey: ["etf-profile", ticker],
    queryFn: () => fetch(`/api/market/etf-profile/${encodeURIComponent(ticker)}`).then(r => r.json()),
    staleTime: 5 * 60_000,
    enabled: isEtf,
  });

  const isLoading = fundLoading || (isEtf && etfLoading);

  return (
    <div
      className="rounded-xl border border-[#1e1e1e] px-5 py-4"
      style={{ background: "linear-gradient(135deg,#0e0e0e 0%,#080808 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="w-3.5 h-3.5 text-[#686868] shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#686868]">
          {isEtf ? "ETF Profile" : "About"}
        </span>
        {fund?.name && fund.name !== ticker && (
          <span className="ml-auto text-[10px] text-[#4a4a4a] truncate max-w-[200px]">{fund.name}</span>
        )}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : isEtf && etf ? (
        <EtfView data={etf} />
      ) : fund ? (
        <StockView data={fund} />
      ) : (
        <p className="text-[11px] text-[#5a5a5a]">No data available.</p>
      )}
    </div>
  );
}
