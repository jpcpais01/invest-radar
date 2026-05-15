"use client";
import { useEffect, useRef } from "react";
import { Sparkles, LineChart, Terminal, FlaskConical, X } from "lucide-react";

/* ─── shared keyframes ────────────────────────────────────────────────────── */
const KEYFRAMES = `
  @keyframes shimmerSweep {
    0%   { background-position: -200% center; }
    100% { background-position: 300% center; }
  }

  /* Glass light blob 1 — blue, moves in a slow irregular arc */
  @keyframes glassBlob1 {
    0%   { transform: translate(0%,   10%)  scale(1.00); opacity: 0.55; }
    20%  { transform: translate(85%, -55%)  scale(1.25); opacity: 0.80; }
    45%  { transform: translate(130%, 60%)  scale(0.85); opacity: 0.38; }
    70%  { transform: translate(20%,  90%)  scale(1.10); opacity: 0.60; }
    100% { transform: translate(0%,   10%)  scale(1.00); opacity: 0.55; }
  }

  /* Glass light blob 2 — violet, orbits at a different speed + phase */
  @keyframes glassBlob2 {
    0%   { transform: translate(120%, -10%) scale(0.90); opacity: 0.30; }
    30%  { transform: translate(15%, -75%)  scale(1.20); opacity: 0.55; }
    60%  { transform: translate(70%,  80%)  scale(1.05); opacity: 0.40; }
    100% { transform: translate(120%, -10%) scale(0.90); opacity: 0.30; }
  }

  /* Subtle background glow pulse */
  @keyframes glassGlow {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 1.0; }
  }

  /* Rising bubbles — science-beaker fizz for the Backtest button */
  @keyframes bubbleRise {
    0%   { transform: translateY(3px)  scale(0.4); opacity: 0; }
    18%  { opacity: 0.85; }
    80%  { opacity: 0.4; }
    100% { transform: translateY(-21px) scale(1.05); opacity: 0; }
  }
`;

/* Backtest-button bubbles — fixed values so SSR and client render identically */
const BUBBLES = [
  { left: "12%", size: 3,   dur: 2.6, delay: 0.0 },
  { left: "24%", size: 2,   dur: 3.1, delay: 1.4 },
  { left: "37%", size: 3.5, dur: 2.2, delay: 0.7 },
  { left: "49%", size: 2.5, dur: 2.9, delay: 2.0 },
  { left: "61%", size: 3,   dur: 2.4, delay: 0.4 },
  { left: "72%", size: 2,   dur: 3.3, delay: 1.1 },
  { left: "84%", size: 3.5, dur: 2.7, delay: 1.8 },
  { left: "92%", size: 2.5, dur: 2.5, delay: 0.9 },
];

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
        {/* blob 1 — cyan-blue, slow irregular orbit */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "60%", height: "200%",
            top: "-50%", left: "-5%",
            background:
              "radial-gradient(ellipse at center, rgba(147,210,255,0.32) 0%, rgba(99,179,255,0.10) 45%, transparent 70%)",
            animation: "glassBlob1 5.5s ease-in-out infinite",
            filter: "blur(7px)",
          }}
        />
        {/* blob 2 — violet, different speed + phase for chromatic split feel */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "48%", height: "180%",
            top: "-40%", left: "15%",
            background:
              "radial-gradient(ellipse at center, rgba(192,168,255,0.22) 0%, rgba(139,120,255,0.07) 45%, transparent 70%)",
            animation: "glassBlob2 8s ease-in-out infinite",
            filter: "blur(6px)",
          }}
        />
        {/* top-edge glass gleam — static sharp highlight */}
        <div
          className="absolute top-0 inset-x-3 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(147,197,253,0.60), transparent)",
          }}
        />
        {/* inner depth glow — pulses very slowly */}
        <div
          className="absolute inset-0 pointer-events-none rounded-md"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.10) 0%, transparent 70%)",
            animation: "glassGlow 4s ease-in-out infinite",
          }}
        />

        <Sparkles
          className="w-3.5 h-3.5 relative z-10 shrink-0"
          style={{ filter: "drop-shadow(0 0 5px rgba(147,197,253,0.70))" }}
        />
        <span className="relative z-10 whitespace-nowrap">Ask AI</span>
        <X className="w-3 h-3 ml-0.5 relative z-10 transition-opacity duration-150"
          style={{ opacity: open ? 0.6 : 0 }} />
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
    const ctxRaw = el.getContext("2d");
    if (!ctxRaw) return;
    const ctx: CanvasRenderingContext2D = ctxRaw;

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

/* ════════════════════════════════════════════════════════════════════════════
   BACKTEST — violet glass, the strategy lab
   ════════════════════════════════════════════════════════════════════════════ */
export function StrategyBtn() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <a
        href="/strategy"
        className="relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium shrink-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(139,92,246,0.14) 0%, rgba(124,58,237,0.10) 50%, rgba(139,92,246,0.08) 100%)",
          border: "1px solid rgba(167,139,250,0.30)",
          color: "#c4b5fd",
          textDecoration: "none",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow:
            "inset 0 1px 0 rgba(196,181,253,0.16), 0 0 10px rgba(139,92,246,0.08)",
        }}
      >
        {/* blob 1 — violet, slow orbit */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "60%", height: "200%",
            top: "-50%", left: "-5%",
            background:
              "radial-gradient(ellipse at center, rgba(192,168,255,0.30) 0%, rgba(139,120,255,0.10) 45%, transparent 70%)",
            animation: "glassBlob1 5.5s ease-in-out infinite",
            filter: "blur(7px)",
          }}
        />
        {/* blob 2 — indigo, different phase */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: "48%", height: "180%",
            top: "-40%", left: "15%",
            background:
              "radial-gradient(ellipse at center, rgba(165,180,252,0.20) 0%, rgba(99,102,241,0.07) 45%, transparent 70%)",
            animation: "glassBlob2 8s ease-in-out infinite",
            filter: "blur(6px)",
          }}
        />
        {/* rising bubbles — science-beaker fizz */}
        <div className="absolute inset-0 pointer-events-none">
          {BUBBLES.map((b, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: b.left, bottom: 0,
                width: b.size, height: b.size,
                background: "rgba(196,181,253,0.7)",
                boxShadow: "0 0 3px rgba(196,181,253,0.5)",
                animation: `bubbleRise ${b.dur}s ease-in ${b.delay}s infinite`,
              }}
            />
          ))}
        </div>
        {/* top-edge gleam */}
        <div
          className="absolute top-0 inset-x-3 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(196,181,253,0.60), transparent)",
          }}
        />
        {/* inner depth glow */}
        <div
          className="absolute inset-0 pointer-events-none rounded-md"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.12) 0%, transparent 70%)",
            animation: "glassGlow 4s ease-in-out infinite",
          }}
        />

        <FlaskConical
          className="w-3.5 h-3.5 relative z-10 shrink-0"
          style={{ filter: "drop-shadow(0 0 5px rgba(196,181,253,0.70))" }}
        />
        <span className="relative z-10 whitespace-nowrap">Backtest</span>
      </a>
    </>
  );
}
