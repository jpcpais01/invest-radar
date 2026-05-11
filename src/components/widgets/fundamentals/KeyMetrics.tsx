"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { Fundamentals } from "@/types/market";
import { formatNumber } from "@/lib/utils";

interface Props { ticker: string; id: string }

function MetricRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#21262d] last:border-0">
      <span className="text-[11px] text-[#8b949e]">{label}</span>
      <span className="text-[11px] font-mono font-medium text-[#e6edf3]">{value ?? "—"}</span>
    </div>
  );
}

export default function KeyMetrics({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["fundamentals", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/fundamentals/${ticker}`);
      return res.json() as Promise<Fundamentals>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const askAI = data
    ? `Key fundamentals for ${ticker} (${data.name}): Market Cap ${data.marketCap ? formatNumber(data.marketCap) : "N/A"}, P/E ${data.pe?.toFixed(1) ?? "N/A"}, EV/EBITDA ${data.evEbitda?.toFixed(1) ?? "N/A"}, Revenue Growth ${data.revenueGrowth ? (data.revenueGrowth * 100).toFixed(1) + "%" : "N/A"}. Is this stock fairly valued?`
    : undefined;

  return (
    <WidgetShell
      title="Key Metrics"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load fundamentals" : null}
      askAIContext={askAI}
    >
      {data && (
        <div className="p-3 overflow-y-auto h-full">
          {data.name && (
            <div className="mb-2">
              <div className="text-xs font-semibold text-white">{data.name}</div>
              {data.sector && <div className="text-[11px] text-[#8b949e]">{data.sector} · {data.industry}</div>}
            </div>
          )}
          <div className="divide-y divide-transparent">
            <MetricRow label="Market Cap" value={data.marketCap ? `$${formatNumber(data.marketCap)}` : undefined} />
            <MetricRow label="P/E (TTM)" value={data.pe?.toFixed(2)} />
            <MetricRow label="Forward P/E" value={data.forwardPE?.toFixed(2)} />
            <MetricRow label="P/S" value={data.ps?.toFixed(2)} />
            <MetricRow label="P/B" value={data.pb?.toFixed(2)} />
            <MetricRow label="EV/EBITDA" value={data.evEbitda?.toFixed(2)} />
            <MetricRow label="Revenue" value={data.revenue ? `$${formatNumber(data.revenue)}` : undefined} />
            <MetricRow label="Rev Growth" value={data.revenueGrowth ? `${(data.revenueGrowth * 100).toFixed(1)}%` : undefined} />
            <MetricRow label="EPS Growth" value={data.epsGrowth ? `${(data.epsGrowth * 100).toFixed(1)}%` : undefined} />
            <MetricRow label="Dividend Yield" value={data.dividendYield ? `${(data.dividendYield * 100).toFixed(2)}%` : undefined} />
            <MetricRow label="Beta" value={data.beta?.toFixed(2)} />
            <MetricRow label="52W High" value={data.fiftyTwoWeekHigh ? `$${data.fiftyTwoWeekHigh.toFixed(2)}` : undefined} />
            <MetricRow label="52W Low" value={data.fiftyTwoWeekLow ? `$${data.fiftyTwoWeekLow.toFixed(2)}` : undefined} />
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
