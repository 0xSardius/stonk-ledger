import { cn } from "@/lib/utils";
import {
  formatNumber,
  type NumberContext,
  type NumberType,
  type SignMode,
} from "@/lib/format";

/** Every number on screen goes through this. font-mono tabular-nums, raw value in title. */
export function Num({
  value,
  type,
  context = "compact",
  tokenPriceUsd,
  sign,
  className,
}: {
  value: number | null | undefined;
  type: NumberType;
  context?: NumberContext;
  tokenPriceUsd?: number | null;
  sign?: SignMode;
  className?: string;
}) {
  const r = formatNumber(value, { type, context, tokenPriceUsd, sign });
  return (
    <span
      className={cn("font-mono tabular-nums", className)}
      aria-label={r.isSubscript || r.isTiny ? r.ariaLabel : undefined}
      title={r.raw || undefined}
    >
      {r.display}
    </span>
  );
}
