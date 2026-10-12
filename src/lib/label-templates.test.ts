import { describe, expect, it } from "vitest";
import {
  LABEL_TEMPLATES,
  getTemplate,
  gridExtent,
  gridFits,
  pageCount,
  placement,
  sheetCapacity,
  slotPosition,
} from "./label-templates";

const l7160 = getTemplate("l7160");
const thermal80 = getTemplate("thermal80");

describe("sheet capacity (published Avery counts)", () => {
  it.each([
    ["l7160", 21],
    ["l7163", 14],
    ["l7654", 40],
  ])("%s is %i-up", (id, up) => {
    expect(sheetCapacity(getTemplate(id))).toBe(up);
  });
});

describe("slot positions land inside A4 with symmetric margins", () => {
  it.each(["l7160", "l7163", "l7654"])("%s fits the sheet", (id) => {
    const t = getTemplate(id);
    const last = slotPosition(t, sheetCapacity(t) - 1);
    const right = last.xMm + t.labelWidthMm;
    const bottom = last.yMm + t.labelHeightMm;

    expect(right).toBeLessThanOrEqual(210);
    expect(bottom).toBeLessThanOrEqual(297);
    // Side margins agree with each other to within half a millimetre.
    expect(Math.abs(t.sideMm - (210 - right))).toBeLessThan(0.5);
    expect(Math.abs(t.topMm - (297 - bottom))).toBeLessThan(0.5);
  });

  it("gaps sit between labels only — a 1-up grid is margin + label", () => {
    const t = { ...getTemplate("custom"), cols: 1, rows: 1 };
    expect(gridExtent(t).widthMm).toBeCloseTo(t.sideMm + t.labelWidthMm);
  });
});

describe("placement and paging", () => {
  it("a full first sheet fills slots 0..20 in order, all on page 0", () => {
    expect(pageCount(l7160, 21, 1)).toBe(1);
    const slots = Array.from({ length: 21 }, (_, i) => placement(l7160, i, 1));
    expect(slots.map((s) => s.slot)).toEqual(
      Array.from({ length: 21 }, (_, i) => i),
    );
    expect(slots.every((s) => s.page === 0)).toBe(true);
  });

  it("a partial sheet keeps pitch and spills onto sheet 2", () => {
    expect(pageCount(l7160, 21, 5)).toBe(2);
    expect(placement(l7160, 0, 5)).toEqual({ page: 0, slot: 4 });
    expect(placement(l7160, 16, 5)).toEqual({ page: 0, slot: 20 });
    expect(placement(l7160, 17, 5)).toEqual({ page: 1, slot: 0 });
  });

  it("start beyond one sheet renders no blank leading sheets", () => {
    expect(placement(l7160, 0, 22)).toEqual({ page: 0, slot: 0 });
    expect(pageCount(l7160, 21, 22)).toBe(1);
    expect(placement(l7160, 0, 26)).toEqual({ page: 0, slot: 4 });
  });

  it("thermal labels run one per page regardless of start", () => {
    expect(pageCount(thermal80, 3, 1)).toBe(3);
    expect(placement(thermal80, 2, 1).page).toBe(2);
    expect(placement(thermal80, 0, 9).page).toBe(0);
  });

  it("an empty run needs no pages", () => {
    expect(pageCount(l7160, 0, 1)).toBe(0);
  });
});

describe("fit validation (grid must land inside the sheet)", () => {
  it("every published A4 preset fits", () => {
    for (const t of LABEL_TEMPLATES.filter((x) => x.kind === "a4")) {
      expect(gridFits(t), `${t.id} ${JSON.stringify(gridExtent(t))}`).toBe(
        true,
      );
    }
  });

  it("thermal rolls always fit (cut-to-height by construction)", () => {
    expect(gridFits(getTemplate("thermal58"))).toBe(true);
    expect(gridFits(getTemplate("thermal80"))).toBe(true);
  });

  it("rejects a grid wider than the sheet", () => {
    expect(gridFits({ ...getTemplate("custom"), cols: 5 })).toBe(false);
  });

  it("rejects a grid taller than the sheet", () => {
    expect(gridFits({ ...getTemplate("custom"), rows: 10 })).toBe(false);
  });

  it("rejects a side margin that pushes labels off the edge", () => {
    expect(gridFits({ ...getTemplate("custom"), sideMm: 160 })).toBe(false);
  });

  it("accepts exactly 210mm and rejects a hair past", () => {
    const exact = {
      ...getTemplate("custom"),
      cols: 3,
      gapXMm: 0,
      sideMm: 210 - 3 * 63.5,
    };
    expect(gridExtent(exact).widthMm).toBeCloseTo(210, 9);
    expect(gridFits(exact)).toBe(true);
    expect(gridFits({ ...exact, sideMm: exact.sideMm + 0.05 })).toBe(false);
  });
});
