import { describe, expect, it } from "vitest";
import { OLFACTIVE_GROUPS } from "../convex/schema";
import { parseInventoryCsv, toInventoryCsv } from "./csv";

describe("parseInventoryCsv", () => {
  it("accepts a product base as both group and category", () => {
    const { rows, errors } = parseInventoryCsv(
      "Melt & Pour Soap Base,Candle Wax,1000,1000,24.00,0.024,Vendor,Candle Wax",
    );
    // "Candle Wax" is the group here — the name may be anything.
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].olfactiveGroup).toBe("Candle Wax");
    expect(rows[0].category).toBe("Candle Wax");
  });

  it("accepts every product-base group in the Group column", () => {
    for (const group of OLFACTIVE_GROUPS) {
      const { rows, errors } = parseInventoryCsv(
        `Some Material,${group},100,100,10,0.1,Vendor`,
      );
      expect(errors).toEqual([]);
      expect(rows[0].olfactiveGroup).toBe(group);
    }
  });

  it("rejects an unknown category and names the known ones", () => {
    const { errors } = parseInventoryCsv(
      "Wax,Candle Wax,100,100,10,0.1,Vendor,Glitter",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Glitter");
    expect(errors[0]).toContain("Solubilizer");
  });
});

describe("toInventoryCsv", () => {
  it("round-trips a product-base material through parse", () => {
    const csv = toInventoryCsv([
      {
        name: "Shea Butter Lotion Base",
        olfactiveGroup: "Lotion Base",
        category: "Lotion Base",
        initialGrams: 500,
        remainingGrams: 250.5,
        price: 18,
        pricePerGram: 0.036,
        vendor: "Bramble Berry",
      },
    ]);
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      name: "Shea Butter Lotion Base",
      olfactiveGroup: "Lotion Base",
      category: "Lotion Base",
      remainingGrams: 250.5,
      vendor: "Bramble Berry",
    });
  });
});
