"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PropsWithChildren } from "react";
import { AppClientProvider } from "../lib/client-provider";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <AppClientProvider>{children}</AppClientProvider>
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
