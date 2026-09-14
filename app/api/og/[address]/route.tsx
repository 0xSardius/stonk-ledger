import { ImageResponse } from "next/og";
import { getStatement, isValidAddress } from "@/lib/statement";
import { formatNumber, truncateAddress } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/og/[address]: the share card (PRD F3). Dark inversion of Ledger
 * Ink so it reads on X timelines: ink ground, paper text, oxblood accent,
 * the one big number, and the latest proof signature. Reads the database
 * only; never triggers indexing.
 */
const INK = "#1C1917";
const PAPER = "#F5F1EA";
const MUTED = "#A8A29E";
const ACCENT = "#E06A5C";

async function serifFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap",
      {
        headers: { "user-agent": "Mozilla/5.0" },
      }
    ).then((r) => r.text());
    const url = css.match(
      /src: url\(([^)]+)\) format\('(?:truetype|opentype|woff)'\)/
    )?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> }
) {
  const { address } = await ctx.params;
  if (!isValidAddress(address))
    return new Response("bad address", { status: 400 });
  const s = await getStatement(address, { refresh: false });
  const top = s.coins[0] ?? null;
  const serif = await serifFont();

  const headline = top
    ? `${top.symbol} has paid this wallet`
    : "No stock payouts yet";
  const big = top
    ? `${formatNumber(top.totals.shares, { type: "token_amount", context: "detailed", tokenPriceUsd: top.quoteUsd }).display} ${top.quoteSymbol}`
    : truncateAddress(address, 6);
  const sub = top
    ? [
        top.totals.usdToday != null
          ? `${formatNumber(top.totals.usdToday, { type: "fiat_value", context: "detailed" }).display} today`
          : null,
        `${top.totals.count.toLocaleString("en-US")} payouts`,
        `each with a proof link`,
      ]
        .filter(Boolean)
        .join("  ·  ")
    : "Paste a wallet at stonkledger";
  const proof = top?.payouts[0]?.sig
    ? `latest proof  ${top.payouts[0].sig.slice(0, 20)}…`
    : "";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: INK,
        color: PAPER,
        padding: "56px 64px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 26,
        }}
      >
        <span
          style={{
            fontFamily: serif ? "Instrument Serif" : "serif",
            fontSize: 34,
          }}
        >
          Stonk Ledger
        </span>
        <span style={{ color: MUTED, fontFamily: "monospace", fontSize: 24 }}>
          {truncateAddress(address, 6)}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span
          style={{
            color: MUTED,
            fontSize: 28,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {headline}
        </span>
        <span
          style={{
            fontFamily: serif ? "Instrument Serif" : "serif",
            fontSize: big.length > 22 ? 96 : 128,
            lineHeight: 1,
            letterSpacing: -2,
          }}
        >
          {big}
        </span>
        <span style={{ color: PAPER, fontSize: 30, marginTop: 8 }}>{sub}</span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: `3px solid ${PAPER}`,
          paddingTop: 20,
          fontSize: 24,
        }}
      >
        <span style={{ color: ACCENT, fontFamily: "monospace" }}>{proof}</span>
        <span style={{ color: MUTED }}>
          dividends in tokenized stock, with receipts
        </span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: serif
        ? [
            {
              name: "Instrument Serif",
              data: serif,
              style: "normal",
              weight: 400,
            },
          ]
        : undefined,
    }
  );
}
