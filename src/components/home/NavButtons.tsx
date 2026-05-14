"use client";
import { useEffect, useRef } from "react";
import { Sparkles, LineChart, Terminal, X } from "lucide-react";

/* ─── shared keyframes ────────────────────────────────────────────────────── */
const KEYFRAMES = `
  @keyframes shimmerSweep {
    0%   { background-position: -200% center; }
    100% { background-position: 300% center; }
  }
`;

/* ════════════════════════════════════════════════════════════════════════════
   ASK AI — blue glassmorphism with light refraction
   ════════════════════════════════════════════════════════════════════════════ */
export function AskAIBtn({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <button
        onClick={onClick}
        className="relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
        style={{
          background: open
            ? "linear-gradient(135deg, rgba(37,99,235,0.30) 0%, rgba(79,70,229,0.24) 50%, rgba(37,99,235,0.20) 100%)"
            : "linear-gradient(135deg, rgba(37,99,235,0.13) 0%, rgba(79,70,229,0.10) 50%, rgba(37,99,235,0.08) 100%)",
          border: open
            ? "1px solid rgba(96,165,250,0.55)"
            : "1px solid rgba(96,165,250,0.28)",
          color: "#93c5fd",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: open
            ? "0 0 22px rgba(37,99,235,0.22), inset 0 1px 0 rgba(147,197,253,0.22)"
            : "inset 0 1px 0 rgba(147,197,253,0.14), 0 0 10px rgba(37,99,235,0.07)",
        }}
      >
        {/* light refraction sweep */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(110deg, transparent 28%, rgba(147,210,255,0.22) 46%, rgba(214,240,255,0.14) 52%, transparent 68%)",
            backgroundSize: "300% 100%",
            backgroundRepeat: "no-repeat",
            animation: "shimmerSweep 3.8s ease-in-out infinite",
          }}
        />
        {/* top-edge glass gleam */}
        <div
          className="absolute top-0 inset-x-3 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(147,197,253,0.55), transparent)",
          }}
        />
        {/* bottom-edge subtle tint */}
        <div
          className="absolute bottom-0 inset-x-3 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(37,99,235,0.18), transparent)",
          }}
        />

        <Sparkles
          className="w-3.5 h-3.5 relative z-10 shrink-0"
          style={{ filter: "drop-shadow(0 0 5px rgba(147,197,253,0.70))" }}
        />
        <span className="relative z-10 whitespace-nowrap">Ask AI</span>
        {open && <X className="w-3 h-3 ml-0.5 relative z-10 opacity-60" />}
      </button>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   FORECAST — titanium metal with shine sweep
   ════════════════════════════════════════════════════════════════════════════ */
export function ForecastBtn() {
  return (
    <a
      href="/forecast"
      className="relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium shrink-0"
      style={{
        background:
          "linear-gradient(160deg, #1a1a20 0%, #2d2d38 14%, #3b3b48 28%, #484855 42%, #3a3a46 56%, #2c2c36 70%, #3e3e4a 84%, #1a1a20 100%)",
        border: "1px solid rgba(168,170,188,0.22)",
        color: "rgba(218,220,230,0.92)",
        textDecoration: "none",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.32), 0 2px 4px rgba(0,0,0,0.45)",
      }}
    >
      {/* titanium micro-grain */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(255,255,255,0.014) 1px, rgba(255,255,255,0.014) 2.5px)",
        }}
      />
      {/* shine sweep */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(105deg, transparent 33%, rgba(255,255,255,0.19) 50%, transparent 65%)",
          backgroundSize: "300% 100%",
          backgroundRepeat: "no-repeat",
          animation: "shimmerSweep 3s ease-in-out infinite",
          animationDelay: "0.9s",
        }}
      />

      <LineChart className="w-3.5 h-3.5 relative z-10 shrink-0" />
      <span className="relative z-10 whitespace-nowrap">Forecast</span>
    </a>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   TERMINAL — canvas globe + floating prices, terminal green
   ════════════════════════════════════════════════════════════════════════════ */
const FLOAT_TEXTS = [
  "+2.3%", "142.50", "SPY", "-0.8%", "3,847", "+1.1%",
  "TSLA",  "248.90", "-3.2%", "BTC",  "+5.6%", "19,234",
  "NVDA",  "+0.7%",  "189.20", "AAPL", "-1.4%", "+0.3%",
  "QQQ",   "$4,512", "ETH",   "380.1", "+4.1%", "-2.0%",
];

interface Particle { x: number; y: number; vx: number; text: string; alpha: number; sz: number }

export function TerminalBtn({ ticker }: { ticker: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = el.offsetWidth;
    const H   = el.offsetHeight;
    if (!W || !H) return;
    el.width  = Math.round(W * dpr);
    el.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);

    /* globe params — anchor to right side */
    const R  = H * 0.44;
    const gx = W - R - 2;
    const gy = H / 2;
    let rot  = 0;

    const particles: Particle[] = [];
    let fr = 0;

    const spawn = () => {
      if (particles.length >= 10) return;
      particles.push({
        x:     W * 0.36 + Math.random() * W * 0.18,
        y:     4 + Math.random() * (H - 8),
        vx:    -(Math.random() * 0.42 + 0.18),
        text:  FLOAT_TEXTS[Math.floor(Math.random() * FLOAT_TEXTS.length)],
        alpha: Math.random() * 0.38 + 0.12,
        sz:    Math.random() > 0.55 ? 6 : 5,
      });
    };

    /* orthographic projection with slight tilt:
         screen_x = gx + sin(φ)·cos(λ)·R
         screen_y = gy − cos(φ)·R·0.78 + sin(φ)·sin(λ)·R·0.22
         z_depth  = sin(φ)·sin(λ)  → [-1, 1], positive = towards viewer */
    function drawGlobe(ctx: CanvasRenderingContext2D) {
      const LON = 7, LAT = 4, SEGS = 16;

      /* longitude arcs */
      for (let i = 0; i < LON; i++) {
        const lon = (i / LON) * Math.PI * 2 + rot;
        for (let j = 0; j < SEGS; j++) {
          const p0 = (j / SEGS) * Math.PI;
          const p1 = ((j + 1) / SEGS) * Math.PI;
          const sx0 = gx + Math.sin(p0) * Math.cos(lon) * R;
          const sy0 = gy - Math.cos(p0) * R * 0.78 + Math.sin(p0) * Math.sin(lon) * R * 0.22;
          const sx1 = gx + Math.sin(p1) * Math.cos(lon) * R;
          const sy1 = gy - Math.cos(p1) * R * 0.78 + Math.sin(p1) * Math.sin(lon) * R * 0.22;
          const z = (Math.sin((p0 + p1) / 2) * Math.sin(lon) + 1) / 2;
          const a = Math.max(0.03, z * 0.28);
          ctx.beginPath();
          ctx.moveTo(sx0, sy0);
          ctx.lineTo(sx1, sy1);
          ctx.strokeStyle = `rgba(0,255,65,${a.toFixed(2)})`;
          ctx.lineWidth = 0.45;
          ctx.stroke();
        }
      }

      /* latitude rings */
      for (let i = 1; i <= LAT; i++) {
        const phi  = (i / (LAT + 1)) * Math.PI;
        const LSEG = 20;
        ctx.beginPath();
        for (let j = 0; j <= LSEG; j++) {
          const lon = (j / LSEG) * Math.PI * 2;
          const sx  = gx + Math.sin(phi) * Math.cos(lon) * R;
          const sy  = gy - Math.cos(phi) * R * 0.78 + Math.sin(phi) * Math.sin(lon) * R * 0.22;
          j === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = "rgba(0,255,65,0.09)";
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }

      /* intersection dots */
      for (let i = 0; i < LON; i++) {
        for (let j = 1; j <= LAT; j++) {
          const lon = (i / LON) * Math.PI * 2 + rot;
          const phi = (j / (LAT + 1)) * Math.PI;
          const px  = gx + Math.sin(phi) * Math.cos(lon) * R;
          const py  = gy - Math.cos(phi) * R * 0.78 + Math.sin(phi) * Math.sin(lon) * R * 0.22;
          const z   = (Math.sin(phi) * Math.sin(lon) + 1) / 2;
          const a   = Math.max(0.06, z * 0.85);
          ctx.beginPath();
          ctx.arc(px, py, 0.75, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,255,65,${a.toFixed(2)})`;
          ctx.fill();
        }
      }
      rot += 0.007;
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);

      drawGlobe(ctx);

      if (fr % 24 === 0) spawn();
      fr++;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        if (p.x < -60) { particles.splice(i, 1); continue; }
        ctx.font = `${p.sz}px 'Courier New',monospace`;
        ctx.fillStyle = `rgba(0,255,65,${p.alpha})`;
        ctx.fillText(p.text, p.x, p.y + p.sz);
      }

      /* scanlines */
      for (let y = 1; y < H; y += 3) {
        ctx.fillStyle = "rgba(0,0,0,0.065)";
        ctx.fillRect(0, y, W, 1);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <a
      href={`/terminal/${ticker}`}
      className="relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium shrink-0"
      style={{
        background: "#010e01",
        border: "1px solid rgba(0,255,65,0.25)",
        color: "#00ff41",
        textDecoration: "none",
        boxShadow:
          "0 0 12px rgba(0,255,65,0.08), inset 0 0 18px rgba(0,255,65,0.04)",
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%", opacity: 0.88 }}
      />
      <Terminal
        className="w-3.5 h-3.5 relative z-10 shrink-0"
        style={{ filter: "drop-shadow(0 0 4px rgba(0,255,65,0.55))" }}
      />
      <span
        className="relative z-10 whitespace-nowrap"
        style={{ textShadow: "0 0 8px rgba(0,255,65,0.60)" }}
      >
        Terminal
      </span>
    </a>
  );
}
