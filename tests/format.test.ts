import { describe, expect, test } from "vitest";
import { formatNumber, toDecimalString, truncateAddress } from "../lib/format";

const f = (v: number | null, o: Parameters<typeof formatNumber>[1]) =>
  formatNumber(v, o).display;

describe("formatNumber (spec examples)", () => {
  test("fiat", () => {
    expect(f(0, { type: "fiat_value" })).toBe("$0.00");
    expect(f(0.004, { type: "fiat_value" })).toBe("<$0.01");
    expect(f(-0.004, { type: "fiat_value", sign: "always" })).toBe("-<$0.01");
    expect(f(1234.5, { type: "fiat_value" })).toBe("$1.2K");
    expect(f(1234.5, { type: "fiat_value", context: "detailed" })).toBe(
      "$1,234.50"
    );
    expect(f(1.52e12, { type: "fiat_value" })).toBe("$1.5T");
    expect(f(-0, { type: "fiat_value" })).toBe("$0.00");
  });
  test("token amounts with dynamic decimals", () => {
    expect(f(1.23456789, { type: "token_amount", tokenPriceUsd: 84000 })).toBe(
      "1.2346"
    );
    expect(
      f(1.23456789, {
        type: "token_amount",
        context: "detailed",
        tokenPriceUsd: 84000,
      })
    ).toBe("1.23456789");
    expect(f(0.00123456, { type: "token_amount", tokenPriceUsd: 84000 })).toBe(
      "0.001235"
    );
    expect(f(25.62, { type: "token_amount", tokenPriceUsd: 0.00005835 })).toBe(
      "25.6"
    );
    expect(
      f(125234.62, { type: "token_amount", tokenPriceUsd: 0.00005835 })
    ).toBe("125.2K");
    expect(
      f(125234.62, {
        type: "token_amount",
        context: "detailed",
        tokenPriceUsd: 0.00005835,
      })
    ).toBe("125,234.62");
    expect(f(0.00005835, { type: "token_amount", tokenPriceUsd: 1 })).toBe(
      "0.0₄58"
    );
    expect(
      f(0.00005835, {
        type: "token_amount",
        context: "detailed",
        tokenPriceUsd: 1,
      })
    ).toBe("0.0₄5835");
    // an APPLx payout of 0.000064 shares at $330: leading zeros 4 -> subscript
    expect(
      formatNumber(0.000064, { type: "token_amount", tokenPriceUsd: 330 })
        .isSubscript
    ).toBe(true);
    expect(
      f(0.8312, {
        type: "token_amount",
        context: "detailed",
        tokenPriceUsd: 330,
      })
    ).toBe("0.8312");
  });
  test("token prices", () => {
    expect(f(84000, { type: "token_price" })).toBe("$84,000.00");
    expect(f(142.1234, { type: "token_price" })).toBe("$142");
    expect(f(142.1234, { type: "token_price", context: "detailed" })).toBe(
      "$142.12"
    );
    expect(f(12.3456, { type: "token_price" })).toBe("$12.3");
    expect(f(12.3456, { type: "token_price", context: "detailed" })).toBe(
      "$12.346"
    );
    expect(f(0.1235, { type: "token_price" })).toBe("$0.124");
    expect(f(0.00005835, { type: "token_price" })).toBe("$0.0₄58");
  });
  test("percent and ratio", () => {
    expect(f(0.004, { type: "percent" })).toBe("<0.01%");
    expect(f(12.345, { type: "percent" })).toBe("12.35%");
    expect(f(123.456, { type: "percent" })).toBe("123.5%");
    expect(f(10250.4, { type: "percent" })).toBe("10,250%");
    expect(f(2.567, { type: "ratio" })).toBe("2.57x");
    expect(f(1250, { type: "ratio" })).toBe("1,250x");
  });
  test("null, NaN, infinity", () => {
    expect(f(null, { type: "fiat_value" })).toBe("--");
    expect(f(NaN, { type: "percent" })).toBe("--");
    expect(f(Infinity, { type: "token_amount" })).toBe("--");
  });
  test("raw never uses scientific notation", () => {
    expect(toDecimalString(0.00005835)).toBe("0.00005835");
    expect(
      formatNumber(1e-7, { type: "token_amount", tokenPriceUsd: 1 }).raw
    ).toBe("0.0000001");
  });
  test("truncateAddress", () => {
    expect(truncateAddress("88tvtBFWdb814MGm2PoGXXDqpEvntpxEwC8ayhbbJoN")).toBe(
      "88tv...bJoN"
    );
  });
});
