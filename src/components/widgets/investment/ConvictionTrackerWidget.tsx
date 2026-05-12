"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { cn } from "@/lib/utils";

interface Props { ticker: string; id: string }

interface Transaction {
  name: string;
  relation: string;
  text: string;
  date: string;
  shares: number;
  value: number;
  isBuy: boolean;
}

interface InsiderData {
  transactions: Transaction[];
  netShares: number;
  byQuarter: Record<string, { buys: number; sells: number; netShares: number }>;
}

function formatShares(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(abs / 1_000).toFixed(0)}K`;
  return abs.toLocaleString();
}

function formatValue(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs.toLocaleString()}`;
}

function shortRelation(rel: string) {
  if (/ceo|chief exec/i.test(rel)) return "CEO";
  if (/cfo|chief fin/i.test(rel)) return "CFO";
  if (/coo|chief oper/i.test(rel)) return "COO";
  if (/director/i.test(rel)) return "Dir";
  if (/president/i.test(rel)) return "Pres";
  if (/10%|major/i.test(rel)) return "10%+";
  if (/officer/i.test(rel)) return "Ofcr";
  return rel.slice(0, 4);
}

export default function ConvictionTrackerWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery<InsiderData>({
    queryKey: ["insiders", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/insiders/${ticker}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
  });

  const txns = data?.transactions ?? [];
  const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const netShares = data?.netShares ?? 0;
  const byQ = data?.byQuarter ?? {};
  const quarters = Object.keys(byQ).sort().slice(-4);

  const netLabel = netShares > 0 ? "Net Buyers" : netShares < 0 ? "Net Sellers" : "Neutral";
  const netColor = netShares > 0 ? "#3fb950" : netShares < 0 ? "#f85149" : "#8b949e";

  const askAI = data
    ? `${ticker} insider activity: ${txns.length} transactions. Net position: ${netShares > 0 ? "+" : ""}${formatShares(netShares)} shares (${netLabel}). Recent activity: ${sorted.slice(0, 3).map((t) => `${t.isBuy ? "Buy" : "Sale"} by ${shortRelation(t.relation)} (${t.date})`).join("; ")}. What does management conviction suggest about this investment?`
    : undefined;

  return (
    <WidgetShell
      title="Management Conviction"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load insider data" : null}
      askAIContext={askAI}
    >
      {data && txns.length === 0 && (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-[#484f58]">No insider transactions found for {ticker}</p>
        </div>
      )}

      {data && txns.length > 0 && (
        <div className="p-3 flex flex-col gap-3 h-full overflow-y-auto">
          {/* Net summary */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-[#8b949e]">Net shares (open-market)</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-bold" style={{ color: netColor }}>
                  {netShares > 0 ? "+" : ""}{formatShares(netShares)}
                </span>
                <span className="text-[10px]" style={{ color: netColor }}>shares</span>
              </div>
            </div>
            <div
              className="text-[10px] font-semibold px-2 py-1 rounded-full"
              style={{ color: netColor, background: `${netColor}15`, border: `1px solid ${netColor}35` }}
            >
              {netLabel}
            </div>
          </div>

          {/* Quarterly bars */}
          {quarters.length > 0 && (
            <div>
              <div className="text-[9px] text-[#484f58] mb-1.5 uppercase tracking-wider">By Quarter</div>
              <div className="flex gap-1.5 items-end h-10">
                {quarters.map((q) => {
                  const qd = byQ[q];
                  const net = qd.netShares;
                  const maxAbs = Math.max(...quarters.map((qq) => Math.abs(byQ[qq].netShares)), 1);
                  const heightPct = Math.abs(net) / maxAbs;
                  const isPos = net >= 0;
                  return (
                    <div key={q} className="flex flex-col items-center gap-0.5 flex-1">
                      <div className="flex flex-col-reverse w-full items-center" style={{ height: 36 }}>
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: `${heightPct * 100}%`,
                            minHeight: 2,
                            backgroundColor: isPos ? "#3fb950" : "#f85149",
                            opacity: 0.75,
                          }}
                        />
                      </div>
                      <div className="text-[8px] text-[#484f58] whitespace-nowrap">{q.split("-")[1]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transaction list */}
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider">Recent Transactions</div>
              <div className="text-[8px] text-[#30363d]">Sales include option exercises</div>
            </div>
            {sorted.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start justify-between gap-2 py-1.5 border-b border-[#21262d] last:border-0"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: t.isBuy ? "#3fb950" : "#f85149" }}
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] text-[#e6edf3] truncate">{t.name.split(" ").slice(-1)[0]}</div>
                    <div className="text-[9px] text-[#484f58]">{shortRelation(t.relation)} · {t.date}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="text-[10px] font-mono font-medium"
                    style={{ color: t.isBuy ? "#3fb950" : "#f85149" }}
                  >
                    {t.isBuy ? "+" : "–"}{formatShares(t.shares)}
                  </div>
                  {t.value > 0 && (
                    <div className="text-[9px] text-[#484f58] font-mono">{formatValue(t.value)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
