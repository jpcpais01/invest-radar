"use client";
import { useEffect, useState } from "react";

const DISMISS_KEY = "pwa-prompt-dismissed";
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
}

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_TTL;
  } catch { return false; }
}

export default function PWAProvider() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt?: () => Promise<void> } | null>(null);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt?: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Explicit trigger from footer — always show regardless of cooldown
    const handleForceShow = () => {
      if (!isInstalled()) { setIos(isIOS()); setShow(true); }
    };
    window.addEventListener("pwa:show", handleForceShow);

    // Auto-prompt after 3 s (respects cooldown + installed check)
    const timer = setTimeout(() => {
      if (isInstalled() || wasDismissedRecently()) return;
      if (isIOS()) { setIos(true); setShow(true); }
    }, 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("pwa:show", handleForceShow);
      clearTimeout(timer);
    };
  }, []);

  // Auto-show when browser fires beforeinstallprompt (Chrome/Android), respects cooldown
  useEffect(() => {
    if (!deferredPrompt) return;
    const t = setTimeout(() => {
      if (!isInstalled() && !wasDismissedRecently()) setShow(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [deferredPrompt]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  const install = async () => {
    if (deferredPrompt?.prompt) await deferredPrompt.prompt();
    dismiss();
  };

  if (!show) return null;

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/60" onClick={dismiss} />
      <div
        className="fixed bottom-0 left-0 right-0 z-[9999] rounded-t-2xl border-t border-[#2c2c2c] px-6 py-6 animate-slide-up"
        style={{ background: "#101010", boxShadow: "0 -24px 64px rgba(0,0,0,0.8)" }}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[#2c2c2c]" />

        <div className="flex items-start gap-4">
          <div className="shrink-0 w-14 h-14 rounded-2xl border border-[#c0c0cc22] bg-[#080808] flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="pwa-dg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e0e0e8"/>
                  <stop offset="50%" stopColor="#c0c0cc"/>
                  <stop offset="100%" stopColor="#8888a0"/>
                </linearGradient>
              </defs>
              <polygon points="96,32 152,96 96,160 40,96" fill="url(#pwa-dg)" opacity="0.95"/>
              <polygon points="96,56 132,96 96,136 60,96" fill="#080808" opacity="0.45"/>
              <polygon points="96,68 120,96 96,124 72,96" fill="url(#pwa-dg)" opacity="0.6"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#f0f0f0]">Open Terminal</p>
            <p className="text-xs text-[#767676] mt-0.5">AI-powered investment analysis</p>

            {ios ? (
              <div className="mt-3 text-xs text-[#a0a0b0] space-y-1">
                <p>To install on iPhone/iPad:</p>
                <p>1. Tap the <span className="font-semibold text-[#c0c0cc]">Share</span> button <span className="font-mono">⬆</span></p>
                <p>2. Scroll down and tap <span className="font-semibold text-[#c0c0cc]">Add to Home Screen</span></p>
              </div>
            ) : (
              <button
                onClick={install}
                className="mt-3 px-4 py-1.5 rounded-md bg-[#c0c0cc15] border border-[#c0c0cc30] text-xs font-semibold text-[#c0c0cc] hover:bg-[#c0c0cc22] transition-colors"
              >
                Install App
              </button>
            )}
          </div>
        </div>

        <button
          onClick={dismiss}
          className="mt-5 w-full text-xs text-[#3a3a3a] hover:text-[#767676] transition-colors"
        >
          Not now
        </button>
      </div>
    </>
  );
}
