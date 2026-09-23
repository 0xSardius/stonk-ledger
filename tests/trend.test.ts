import { describe, expect, test } from "vitest";
import { weekOnWeek } from "../lib/trend";

const now = new Date("2026-09-23T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);

describe("weekOnWeek", () => {
  test("a falling payout stream reads as a negative change", () => {
    // the TREE holder: about $451 this week against about $1,200 the week before
    const c = weekOnWeek({ last7: 451, prev7: 1200, first: daysAgo(17), now });
    expect(c).toBeCloseTo(-0.624, 3);
  });

  test("hidden when stored history does not cover the previous week", () => {
    expect(
      weekOnWeek({ last7: 10, prev7: 2, first: daysAgo(9), now })
    ).toBeNull();
  });

  test("hidden when nothing was paid the week before", () => {
    expect(
      weekOnWeek({ last7: 10, prev7: 0, first: daysAgo(30), now })
    ).toBeNull();
  });
});
