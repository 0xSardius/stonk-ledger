"use client";

import { Toaster } from "sonner";
import { PropsWithChildren } from "react";
import { AppClientProvider } from "../lib/client-provider";

/**
 * Light theme only until the brand pass. next-themes was removed because its
 * inline script trips a React 19 dev warning on every load.
 */
export function Providers({ children }: PropsWithChildren) {
  return (
    <>
      <AppClientProvider>{children}</AppClientProvider>
      <Toaster position="bottom-right" richColors />
    </>
  );
}
