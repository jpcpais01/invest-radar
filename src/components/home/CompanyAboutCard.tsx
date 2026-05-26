"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Globe, Users, MapPin, ExternalLink } from "lucide-react";
import { Fundamentals } from "@/types/market";

interface Props { ticker: string }

function fmtEmployees(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtMarketCap(n: number): string {
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

export default function CompanyAboutCard({ ticker }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<Fundamentals>({
    queryKey: ["fundamentals", ticker],
    queryFn: () => fetch(`/api/market/fundamentals/${encodeURIComponent(ticker)}`).then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const desc = data?.description ?? "";
  const SHORT_LIMIT = 280;
  const isLong = desc.length > SHORT_LIMIT;
  const displayDesc = isLong && !expanded ? desc.slice(0, SHORT_LIMIT).trimEnd() + "…" : desc;

  const exchangeLabel = data?.exchange ? (EXCHANGE_LABELS[data.exchange] ?? data.exchange) : null;

  return (
    <div
      className="rounded-xl border border-[#1e1e1e] px-5 py-4"
      style={{ background: "linear-gradient(135deg,#0e0e0e 0%,#080808 100%)" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="w-3.5 h-3.5 text-[#3a3a3a] shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#3a3a3a]">About</span>
        {data?.name && data.name !== ticker && (
          <span className="ml-auto text-[10px] text-[#4a4a4a] truncate max-w-[200px]">{data.name}</span>
        )}
      </div>

      {/* ── Sector / Industry pills ── */}
      {(data?.sector || data?.industry) && (
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

      {/* ── Description ── */}
      {isLoading ? (
        <div className="space-y-1.5 mb-3">
          {[100, 92, 78, 60].map((w, i) => (
            <div key={i} className="h-3 rounded animate-pulse bg-[#1a1a1a]" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : desc ? (
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
      ) : !isLoading ? (
        <p className="text-[11px] text-[#2c2c2c] mb-3">No description available.</p>
      ) : null}

      {/* ── Quick facts strip ── */}
      {data && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-3 border-t border-[#161616]">
          {/* Market cap */}
          {data.marketCap != null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] uppercase tracking-widest text-[#2c2c2c] font-medium">Mkt Cap</span>
              <span className="text-[11px] font-semibold font-mono text-[#c8c8e0]">{fmtMarketCap(data.marketCap)}</span>
            </div>
          )}

          {/* Employees */}
          {data.employees != null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] uppercase tracking-widest text-[#2c2c2c] font-medium flex items-center gap-1">
                <Users className="w-2.5 h-2.5" />Employees
              </span>
              <span className="text-[11px] font-semibold font-mono text-[#c8c8e0]">{fmtEmployees(data.employees)}</span>
            </div>
          )}

          {/* Country */}
          {data.country && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] uppercase tracking-widest text-[#2c2c2c] font-medium flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" />HQ
              </span>
              <span className="text-[11px] font-semibold text-[#c8c8e0]">{data.country}</span>
            </div>
          )}

          {/* Exchange */}
          {exchangeLabel && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] uppercase tracking-widest text-[#2c2c2c] font-medium">Exchange</span>
              <span className="text-[11px] font-semibold text-[#c8c8e0]">{exchangeLabel}</span>
            </div>
          )}

          {/* Website */}
          {data.website && (
            <div className="flex flex-col gap-0.5 ml-auto">
              <span className="text-[8px] uppercase tracking-widest text-[#2c2c2c] font-medium flex items-center gap-1">
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
      )}
    </div>
  );
}
