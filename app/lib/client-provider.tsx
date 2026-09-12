"use client";

import { useMemo, type ReactNode } from "react";
import { ClientProvider, useClient } from "@solana/react";
import { createAppClient, type AppClient } from "./solana-client";

export function AppClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => createAppClient(), []);
  return <ClientProvider client={client}>{children}</ClientProvider>;
}

export function useAppClient() {
  return useClient<AppClient>();
}
