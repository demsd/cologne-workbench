import { describe, expect, it } from "vitest";
import {
  GRAM_DECIMALS,
  PCT_DECIMALS,
  SCALE_TOLERANCE,
  computePercentages,
  formatGrams,
  formatMl,
  formatPct,
  nextVersionNumber,
  planRescale,
  roundTo,
  sortGroups,
} from "./formula-math";

describe("roundTo", () => {
  it("fixes the classic float case (2.675 at 2dp)", () => {
    expect(roundTo(2.675, 2)).toBe(2.68);
  });

  it("absorbs 0.1 + 0.2 drift at ledger precision", () => {
    expect(roundTo(0.1 + 0.2, GRAM_DECIMALS)).toBe(0.3);
  });

  it("rounds to the requested decimals", () => {
    expect(roundTo(1.23456, 4)).toBe(1.2346);
    expect(roundTo(1.23456, PCT_DECIMALS)).toBe(1.23);
  });
});

describe("computePercentages", () => {
  it("always totals exactly 100.00 at 2dp", () => {
    for (const amounts of [[10, 20], [1, 1, 1], [0.01, 99.99], [7], [3, 3, 3, 3]]) {
      const sum = computePercentages(amounts).reduce((s, p) => s + p, 0);
      expect(roundTo(sum, PCT_DECIMALS)).toBe(100);
    }
  });

  it("splits thirds correctly with drift settled on the largest", () => {
    expect(computePercentages([1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
  });

  it("keeps exact shares exact", () => {
    expect(computePercentages([10, 20])).toEqual([33.33, 66.67]);
  });

  it("returns zeros when the formula weighs nothing", () => {
    expect(computePercentages([0, 0])).toEqual([0, 0]);
  });
});

describe("nextVersionNumber (v1.0 → v1.1 lineage)", () => {
  it.each([
    ["V1", "V1.1"],
    ["V1.1", "V1.2"],
    ["v3.2", "v3.3"],
    ["V1.0", "V1.1"],
    ["V10", "V10.1"],
    ["1", "1.1"],
    ["  V1  ", "V1.1"],
    ["Draft", "Draft.1"],
  ])("%j → %j", (input, expected) => {
    expect(nextVersionNumber(input)).toBe(expected);
  });
});

describe("planRescale (the bench's follow-the-scale engine)", () => {
  const steps = [
    { materialName: "A", originalTarget: 10, currentTarget: 10, actual: 12 },
    { materialName: "B", originalTarget: 20, currentTarget: 20 },
    { materialName: "C", originalTarget: 30, currentTarget: 30 },
  ];

  it("returns null when the pour is on target", () => {
    const onTarget = steps.map((s) => ({ ...s, actual: s.originalTarget }));
    expect(planRescale(onTarget, 0)).toBeNull();
  });

  it("returns null at the tolerance boundary", () => {
    const barely = steps.map((s, i) =>
      i === 0
        ? { ...s, actual: 10 + 10 * SCALE_TOLERANCE }
        : { ...s },
    );
    expect(planRescale(barely, 0)).toBeNull();
  });

  it("returns null after the last step (nothing left to weigh)", () => {
    expect(planRescale(steps, 2)).toBeNull();
  });

  it("scales the remainder from DESIGN targets, not current ones", () => {
    // A poured 12 of 10 → factor 1.2; C was already rescaled once (current
    // target differs from design) and must still scale from its design.
    const mixed = [
      steps[0],
      steps[1],
      { ...steps[2], currentTarget: 99 },
    ];
    const plan = planRescale(mixed, 0)!;
    expect(plan.factor).toBeCloseTo(1.2, 9);
    expect(plan.preview).toEqual([
      { name: "B", from: 20, to: 24 },
      { name: "C", from: 99, to: 36 },
    ]);
  });

  it("projects both outcomes: keep vs follow the scale", () => {
    const plan = planRescale(steps, 0)!;
    expect(plan.projectedKeep).toBeCloseTo(12 + 20 + 30, 9);
    expect(plan.projectedScale).toBeCloseTo(12 + 24 + 36, 9);
  });
});

describe("the scaling calculator's invariants (30g → any target)", () => {
  it("exact multiples stay exact", () => {
    const design = [10, 20];
    for (const [factor, expected] of [
      [2, [20, 40]],
      [3, [30, 60]],
      [4, [40, 80]],
    ] as const) {
      expect(design.map((g) => roundTo(g * factor, GRAM_DECIMALS))).toEqual(
        expected,
      );
    }
  });

  it("arbitrary targets sum to the target within ledger precision", () => {
    const design = [1.001, 1.002, 1.003]; // total 3.006
    const target = 4.5;
    const scaled = design.map((g) =>
      roundTo((g * target) / design.reduce((s, g) => s + g, 0), GRAM_DECIMALS),
    );
    const drift = Math.abs(scaled.reduce((s, g) => s + g, 0) - target);
    expect(drift).toBeLessThan(0.001);
    // Percentages never move when grams scale.
    const before = computePercentages(design);
    const after = computePercentages(scaled);
    after.forEach((p, i) => expect(p).toBeCloseTo(before[i], 1));
  });
});

describe("display formatting", () => {
  it("grams trim trailing zeros but keep thousands separators", () => {
    expect(formatGrams(0.5)).toBe("0.5");
    expect(formatGrams(0)).toBe("0");
    expect(formatGrams(1234.5678)).toBe("1,234.568");
  });

  it("percentages always show two places", () => {
    expect(formatPct(5)).toBe("5.00");
    expect(formatPct(33.333)).toBe("33.33");
  });

  it("bottle volume shows an em dash when blank", () => {
    expect(formatMl(undefined)).toBe("—");
    expect(formatMl(30)).toBe("30");
    expect(formatMl(30.555)).toBe("30.56");
  });

  it("groups read in perfumery order, present ones only", () => {
    expect(sortGroups(["Base", "Top", "Alcohol"])).toEqual([
      "Top",
      "Base",
      "Alcohol",
    ]);
  });
});
