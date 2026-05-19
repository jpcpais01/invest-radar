import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import PWAProvider from "@/components/PWAProvider";

export const metadata: Metadata = {
  title: "Open Terminal — AI Investment Analysis",
  description: "AI-powered investment analysis with real-time market data, fair value models, and Monte Carlo forecasting.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Open Terminal",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.svg", type: "image/svg+xml" }],
    apple: "/icons/apple-touch-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#080808",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-screen overflow-hidden">
        <Providers>{children}</Providers>
        <PWAProvider />
      </body>
    </html>
  );
}
