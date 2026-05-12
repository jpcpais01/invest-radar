"use client";
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            // Keep showing previous ticker's data while the new ticker loads —
            // eliminates the flash when switching tickers across all widgets.
            placeholderData: keepPreviousData,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
