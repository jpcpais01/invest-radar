"use client";
import { Download } from "lucide-react";

export default function HomeFooter() {
  const triggerInstall = () => window.dispatchEvent(new CustomEvent("pwa:show"));

  return (
    <footer className="border-t border-[#141414] mt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md border border-[#c0c0cc22] bg-[#c0c0cc06] flex items-center justify-center shrink-0">
            <span className="text-[#c0c0cc] text-[8px] font-bold">◆</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#f0f0f0] tracking-wide leading-none">Open Terminal</p>
            <p className="text-[10px] text-[#3a3a3a] mt-0.5 leading-none">AI investment analysis</p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <p className="text-[10px] text-[#2a2a2a] tabular-nums">© {new Date().getFullYear()}</p>
          <button
            onClick={triggerInstall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#1e1e1e] bg-[#101010] hover:border-[#2c2c2c] hover:bg-[#141414] transition-colors text-[10px] font-semibold text-[#767676] hover:text-[#c0c0cc]"
          >
            <Download className="w-3 h-3" />
            Install App
          </button>
        </div>
      </div>
    </footer>
  );
}
