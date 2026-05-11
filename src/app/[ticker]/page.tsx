"use client";
import { use, useEffect } from "react";
import TopBar from "@/components/layout/TopBar";
import LeftPanel from "@/components/layout/LeftPanel";
import WidgetCanvas from "@/components/layout/WidgetCanvas";
import AISidebar from "@/components/layout/AISidebar";
import { useTickerStore } from "@/store/tickerStore";

export default function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const { setActiveTicker } = useTickerStore();

  useEffect(() => {
    setActiveTicker(ticker);
  }, [ticker, setActiveTicker]);

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel />
        <WidgetCanvas />
        <AISidebar />
      </div>
    </div>
  );
}
