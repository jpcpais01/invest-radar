"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { EarningsEvent } from "@/types/market";
import { cn } from "@/lib/utils";

interface Props { ticker: string; id: string }

export default function EarningsWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["earnings", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/earnings/${ticker}`);
      return res.json() as Promise<{ earnings: EarningsEvent[] }>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const earnings = (data?.earnings ?? []).slice(-8).reverse();
  const beats = earnings.filter((e) => e.beat === true).length;
  const total = earnings.filter((e) => e.beat != null).length;
  const beatRate = total > 0 ? Math.round((beats / total) * 100) : null;

  const askAI = earnings.length > 0
    ? `${ticker} earnings history (last ${earnings.length} quarters): Beat rate ${beatRate ?? "N/A"}%. Most recent: EPS actual ${earnings[0]?.epsActual?.toFixed(2) ?? "N/A"} vs estimate ${earnings[0]?.epsEstimate?.toFixed(2) ?? "N/A"}. Analyze earnings quality.`
    : undefined;

  return (
    <WidgetShell
      title="Earnings History"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load earnings" : null}
      askAIContext={askAI}
    >
      {earnings.length > 0 && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-[#21262d]">
            <div>
              <span className="text-lg font-bold text-white">{beatRate ?? "—"}%</span>
              <span className="text-[11px] text-[#8b949e] ml-1">Beat Rate</span>
            </div>
            <div className="text-[11px] text-[#8b949e]">{beats}/{total} beats</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[#8b949e] border-b border-[#21262d]">
                  <th className="text-left px-3 py-1.5 font-medium">Quarter</th>
                  <th className="text-right px-2 py-1.5 font-medium">Est</th>
                  <th className="text-right px-2 py-1.5 font-medium">Actual</th>
                  <th className="text-right px-3 py-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e, i) => (
                  <tr key={i} className="border-b border-[#21262d] hover:bg-[#21262d] transition-colors">
                    <td className="px-3 py-1.5 text-[#e6edf3]">{e.date}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[#8b949e]">
                      {e.epsEstimate != null ? `$${e.epsEstimate.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[#e6edf3]">
                      {e.epsActual != null ? `$${e.epsActual.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {e.beat === true ? (
                        <span className="text-[#3fb950]">✓ Beat</span>
                      ) : e.beat === false ? (
                        <span className="text-[#f85149]">✗ Miss</span>
                      ) : (
                        <span className="text-[#8b949e]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
