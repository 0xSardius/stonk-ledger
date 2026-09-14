/**
 * Number formatting per the number-formatting spec v1.0 (display only).
 * Types: fiat_value, token_amount, token_price, percent, ratio.
 * Never scientific notation, never "-0.00", null -> "--", zero-subscript for
 * >= 3 leading zeros, dynamic token decimals from the token's USD price.
 */
export type NumberType =
  | "fiat_value"
  | "stable_value"
  | "token_amount"
  | "token_price"
  | "percent"
  | "ratio";
export type NumberContext = "compact" | "detailed";
export type SignMode = "auto" | "always" | "never";

export interface FormatOptions {
  type: NumberType;
  context?: NumberContext;
  tokenPriceUsd?: number | null;
  sign?: SignMode;
}

export interface FormatResult {
  display: string;
  raw: string;
  ariaLabel: string;
  isTiny: boolean;
  isSubscript: boolean;
}

const PLACEHOLDER = "--";
const SUB: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

export function toDecimalString(value: number): string {
  if (value === 0) return "0";
  const s = value.toString();
  if (!/e/i.test(s)) return s;
  return value.toFixed(20).replace(/\.?0+$/, "");
}

/** toFixed with half-away-from-zero rounding (toFixed truncates 0.1235 to 0.123). */
function fixed(abs: number, decimals: number) {
  const f = 10 ** decimals;
  return (Math.round(abs * f + 1e-9) / f).toFixed(decimals);
}

function withCommas(fixed: string) {
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac != null ? `${grouped}.${frac}` : grouped;
}

function leadingZeros(abs: number) {
  if (abs >= 1) return 0;
  const afterDot = abs.toFixed(20).split(".")[1] ?? "";
  let n = 0;
  for (const ch of afterDot) {
    if (ch === "0") n++;
    else break;
  }
  return n;
}

function subscript(abs: number, negative: boolean, sig: number) {
  const zeros = leadingZeros(abs);
  const total = zeros + sig;
  const fixed = abs.toFixed(total);
  const afterDot = fixed.split(".")[1] ?? "";
  const digits = afterDot.slice(zeros, zeros + sig);
  const sub = String(zeros)
    .split("")
    .map((d) => SUB[d] ?? d)
    .join("");
  const sign = negative ? "-" : "";
  return { display: `${sign}0.0${sub}${digits}`, ariaLabel: `${sign}${fixed}` };
}

function abbreviate(abs: number, context: NumberContext) {
  const steps = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const;
  for (const [t, suffix] of steps) {
    if (abs >= t) {
      let s = (abs / t).toFixed(context === "compact" ? 1 : 2);
      s =
        context === "compact" ? s.replace(/\.0$/, "") : s.replace(/\.?0+$/, "");
      return `${s}${suffix}`;
    }
  }
  return null;
}

function signed(display: string, negative: boolean, opts: FormatOptions) {
  const mode = opts.sign ?? "auto";
  if (mode === "never") return display;
  if (negative) return `-${display}`;
  return mode === "always" ? `+${display}` : display;
}

function result(
  display: string,
  raw: string,
  extra: Partial<FormatResult> = {}
): FormatResult {
  return {
    display,
    raw,
    ariaLabel: extra.ariaLabel ?? display,
    isTiny: false,
    isSubscript: false,
    ...extra,
  };
}

export function formatNumber(
  value: number | null | undefined,
  opts: FormatOptions
): FormatResult {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) {
    return {
      display: PLACEHOLDER,
      raw: "",
      ariaLabel: "no data",
      isTiny: false,
      isSubscript: false,
    };
  }
  if (Object.is(value, -0) || Math.abs(value) < Number.EPSILON * 10) value = 0;
  const context = opts.context ?? "compact";
  const raw = toDecimalString(value);
  const abs = Math.abs(value);
  const neg = value < 0;

  if (value === 0) {
    const zero: Record<NumberType, string> = {
      fiat_value: "$0.00",
      stable_value: "$0.00",
      token_amount: "0",
      token_price: "$0.00",
      percent: "0.00%",
      ratio: "0x",
    };
    return result(zero[opts.type], "0");
  }

  switch (opts.type) {
    case "fiat_value":
    case "stable_value": {
      if (abs < 0.005)
        return result(signed("<$0.01", neg, opts), raw, { isTiny: true });
      if (context === "compact") {
        const ab = abbreviate(abs, context);
        if (ab) return result(signed(`$${ab}`, neg, opts), raw);
      }
      return result(signed(`$${withCommas(fixed(abs, 2))}`, neg, opts), raw);
    }
    case "token_amount": {
      const price = opts.tokenPriceUsd;
      const threshold = context === "compact" ? 0.01 : 0.0001;
      const [lo, hi] = context === "compact" ? [0, 6] : [0, 12];
      let decimals =
        price && price > 0 ? Math.ceil(-Math.log10(threshold / price)) : 4;
      decimals = Math.min(hi, Math.max(lo, decimals));
      // detailed never hides cents on whole-unit amounts (125,234.62, not 125,235)
      if (context === "detailed" && abs >= 1) decimals = Math.max(decimals, 2);
      if (context === "compact") {
        if (abs < 1000) decimals = Math.max(decimals, 1);
        // cap significant digits at 5 (1.2346, 0.001235, 25.6), not decimals
        const sigCap =
          abs >= 1
            ? Math.max(0, 5 - (Math.floor(Math.log10(abs)) + 1))
            : leadingZeros(abs) + 5;
        decimals = Math.min(decimals, sigCap);
      }
      if (leadingZeros(abs) >= 3) {
        const s = subscript(abs, neg, context === "compact" ? 2 : 4);
        return result(s.display, raw, {
          ariaLabel: s.ariaLabel,
          isSubscript: true,
        });
      }
      const rounded = Number(fixed(abs, decimals));
      if (rounded === 0) {
        const tiny =
          context === "compact"
            ? "<0.001"
            : `<${(1 / 10 ** decimals).toFixed(decimals)}`;
        return result(signed(tiny, neg, opts), raw, { isTiny: true });
      }
      if (context === "compact" && abs >= 1000) {
        const ab = abbreviate(abs, context);
        if (ab) return result(signed(ab, neg, opts), raw);
      }
      const body = fixed(rounded, decimals).replace(/\.?0+$/, "");
      return result(signed(withCommas(body), neg, opts), raw);
    }
    case "token_price": {
      const sigDetail = context === "compact" ? 3 : 5;
      let body: string;
      if (abs >= 1000) body = withCommas(fixed(abs, 2));
      else if (abs >= 100)
        body = context === "compact" ? fixed(abs, 0) : fixed(abs, 2);
      else if (abs >= 1)
        body = context === "compact" ? fixed(abs, 1) : fixed(abs, 3);
      else if (leadingZeros(abs) >= 3) {
        const s = subscript(abs, neg, context === "compact" ? 2 : 4);
        return result(`${neg ? "-" : ""}$${s.display.replace(/^-/, "")}`, raw, {
          ariaLabel: `$${s.ariaLabel}`,
          isSubscript: true,
        });
      } else {
        const decimals = Math.min(8, leadingZeros(abs) + sigDetail);
        body = fixed(abs, decimals);
        if (context === "detailed")
          body = body.replace(/0+$/, "").replace(/\.$/, "");
        else body = body.replace(/\.?0+$/, "");
      }
      return result(signed(`$${body}`, neg, opts), raw);
    }
    case "percent": {
      if (abs < 0.005)
        return result(signed("<0.01%", neg, opts), raw, { isTiny: true });
      const body =
        abs >= 1000
          ? withCommas(fixed(abs, context === "compact" ? 0 : 1))
          : abs >= 100
            ? fixed(abs, 1)
            : fixed(abs, 2);
      return result(signed(`${body}%`, neg, opts), raw);
    }
    case "ratio": {
      if (abs < 0.005)
        return result(signed("<0.01x", neg, opts), raw, { isTiny: true });
      const body = withCommas(fixed(abs, 2)).replace(/\.?0+$/, "");
      return result(signed(`${body}x`, neg, opts), raw);
    }
  }
}

/** `7xKX...p2aB` */
export function truncateAddress(s: string, chars = 4) {
  if (s.length <= chars * 2 + 3) return s;
  return `${s.slice(0, chars)}...${s.slice(-chars)}`;
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
export function fmtDate(d: Date) {
  return dateFmt.format(d);
}
export function fmtDateTime(d: Date) {
  return `${dateFmt.format(d)} ${timeFmt.format(d)} UTC`;
}

/** StonkFun reports xStock symbols as "APPLX"; the issuer writes "APPLx". */
export function displaySymbol(symbol: string, quoteCategory?: string | null) {
  if (
    (quoteCategory === "xstock" || quoteCategory === "backpack") &&
    /X$/.test(symbol) &&
    symbol.length > 1
  ) {
    return symbol.slice(0, -1) + "x";
  }
  return symbol;
}
