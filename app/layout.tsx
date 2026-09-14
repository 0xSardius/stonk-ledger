import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/providers";
import { AppHeader } from "./components/app-header";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  weight: "400",
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stonk Ledger",
  description:
    "Your memecoin pays you in Apple. We keep the receipts and buy you more.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} font-sans antialiased`}
      >
        <Providers>
          <div className="min-h-screen bg-background text-foreground">
            <AppHeader />
            {children}
            <footer className="mx-auto max-w-4xl px-6 py-10 text-xs text-muted-foreground">
              Informational only. Not tax or investment advice. Stonk Ledger
              never holds your funds except for the momentary keeper hop during
              a Stock DRIP run, which is disclosed before you approve.
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
