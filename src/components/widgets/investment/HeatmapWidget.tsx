"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { cn } from "@/lib/utils";

interface Props { ticker: string; id: string }

type Cell = "bullish" | "bearish" | "neutral" | "insufficient";

interface GridRow {
  key: string;
  label: string;
  cells: { timeframe: string; value: Cell }[];
}

interface HeatmapData {
  grid: GridRow[];
  timeframes: string[];
  agreement: number;
  bias: "bullish" | "bearish" | "mixed";
}

const CELL_STYLES: Record<Cell, string> = {
  bullish:      "bg-[#3fb95022] text-[#3fb950] border-[#3fb95040]",
  bearish:      "bg-[#f8514922] text-[#f85149] border-[#f8514940]",
  neutral:      "bg-[#21262d] text-[#484f58] border-[#21262d]",
  insufficient: "bg-transparent text-[#30363d] border-[#21262d]",
};

const CELL_TEXT: Record<Cell, string> = {
  bullish:      "▲",
  bearish:      "▼",
  neutral:      "–",
  insufficient: "?",
};

const BIAS_COLOR: Record<string, string> = {
  bullish: "#3fb950",
  bearish: "#f85149",
  mixed:   "#d29922",
};

export default function HeatmapWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery<HeatmapData>({
    queryKey: ["heatmap", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/heatmap/${ticker}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const askAI = data
    ? `${ticker} multi-timeframe analysis: ${data.agreement}% agreement, overall bias is ${data.bias}. Grid shows trend, momentum, MACD, volume, and price position across 1M, 3M, 6M, 1Y, 2Y timeframes. What does this tell us about the company's investment trajectory?`
    : undefined;

  return (
    <WidgetShell
      title="Timeframe Agreement"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load heatmap data" : null}
      askAIContext={askAI}
    >
      {data && (
        <div className="p-3 flex flex-col gap-3 h-full overflow-y-auto">
          {/* Summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="text-lg font-bold tabular-nums"
                style={{ color: BIAS_COLOR[data.bias] }}
              >
                {data.agreement}%
              </div>
              <div className="text-[10px] text-[#8b949e]">agreement</div>
            </div>
            <div
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
              style={{
                color: BIAS_COLOR[data.bias],
                background: `${BIAS_COLOR[data.bias]}15`,
                border: `1px solid ${BIAS_COLOR[data.bias]}35`,
              }}
            >
              {data.bias}
            </div>
          </div>

          {/* Heatmap grid */}
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-[#484f58] font-normal pb-2 pr-2 whitespace-nowrap w-24" />
                  {data.timeframes.map((tf) => (
                    <th key={tf} className="text-center text-[#484f58] font-medium pb-2 px-1">
                      {tf}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="space-y-1">
                {data.grid.map((row) => (
                  <tr key={row.key}>
                    <td className="text-[#8b949e] pr-2 py-1 whitespace-nowrap text-[10px] leading-tight">
                      {row.label}
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.timeframe} className="px-1 py-1 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center w-7 h-6 rounded text-[10px] font-bold border",
                            CELL_STYLES[cell.value]
                          )}
                        >
                          {CELL_TEXT[cell.value]}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-[9px] text-[#484f58]">
            <span className="flex items-center gap-1"><span className="text-[#3fb950]">▲</span> Bullish</span>
            <span className="flex items-center gap-1"><span className="text-[#f85149]">▼</span> Bearish</span>
            <span className="flex items-center gap-1"><span className="text-[#484f58]">–</span> Neutral</span>
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
