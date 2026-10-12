/**
 * Label-sheet geometry — the pure maths behind the label printer.
 *
 * Everything is in millimetres and every template models the sheet the way
 * Avery documents one: label size, grid, margins, and the gap between
 * labels (pitch minus size). Positions are derived from the sheet origin,
 * so a partial sheet is just a start offset into the same grid — the
 * technique Avery's own guidance recommends: blank slots keep their pitch,
 * nothing is padded or hidden out of flow.
 *
 * Geometry sources: Avery L7160/L7163/L7654 template pages (label size,
 * grid, margins and pitch published per template). Thermal templates model
 * the roll: page width = roll width, label content inset by a safe margin;
 * the printhead and driver still impose their own hardware margin
 * regardless of what CSS asks for.
 */

export type LabelTemplate = {
  id: string;
  label: string;
  kind: "a4" | "thermal";
  /** Paper width: 210 for A4, the roll width for thermal. */
  pageWidthMm: number;
  /** Paper height: 297 for A4; thermal label height (may be overridden). */
  pageHeightMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  cols: number;
  /** A4 only — thermal labels run one per page down the roll. */
  rows: number;
  sideMm: number;
  topMm: number;
  /** Gap between labels — pitch minus label size, Avery style. */
  gapXMm: number;
  gapYMm: number;
};

/** Avery L7160 — 63.5 x 38.1 mm, 3 x 7 (21-up). */
const L7160: LabelTemplate = {
  id: "l7160",
  label: "A4 sheet · 63.5 × 38.1 (3 × 7)",
  kind: "a4",
  pageWidthMm: 210,
  pageHeightMm: 297,
  labelWidthMm: 63.5,
  labelHeightMm: 38.1,
  cols: 3,
  rows: 7,
  sideMm: 7.3,
  topMm: 15.2,
  gapXMm: 2.5,
  gapYMm: 0,
};

/** Avery L7163 — 99.06 x 38.1 mm, 2 x 7 (14-up). */
const L7163: LabelTemplate = {
  id: "l7163",
  label: "A4 sheet · 99.1 × 38.1 (2 × 7)",
  kind: "a4",
  pageWidthMm: 210,
  pageHeightMm: 297,
  labelWidthMm: 99.06,
  labelHeightMm: 38.1,
  cols: 2,
  rows: 7,
  sideMm: 4.7,
  topMm: 15.2,
  gapXMm: 2.54,
  gapYMm: 0,
};

/** Avery L7654 — 45.72 x 25.4 mm, 4 x 10 (40-up). */
const L7654: LabelTemplate = {
  id: "l7654",
  label: "A4 sheet · 45.7 × 25.4 (4 × 10)",
  kind: "a4",
  pageWidthMm: 210,
  pageHeightMm: 297,
  labelWidthMm: 45.72,
  labelHeightMm: 25.4,
  cols: 4,
  rows: 10,
  sideMm: 9.79,
  topMm: 21.5,
  gapXMm: 2.54,
  gapYMm: 0,
};

/** Custom A4 — start from the common geometry and tune every number. */
const CUSTOM_A4: LabelTemplate = {
  id: "custom",
  label: "Custom A4 grid…",
  kind: "a4",
  pageWidthMm: 210,
  pageHeightMm: 297,
  labelWidthMm: 63.5,
  labelHeightMm: 38.1,
  cols: 3,
  rows: 7,
  sideMm: 7.3,
  topMm: 15.2,
  gapXMm: 2.5,
  gapYMm: 0,
};

/**
 * Direct thermal rolls: page = one label, width = roll width minus the
 * safe margin each side. Label height is adjustable (rolls are cut to
 * whatever the job needs) — the Labels page passes it as `h`.
 */
function thermal(id: string, rollWidthMm: number): LabelTemplate {
  return {
    id,
    label: `Thermal roll · ${rollWidthMm} mm`,
    kind: "thermal",
    pageWidthMm: rollWidthMm,
    pageHeightMm: 40, // default cut height; overridden by the h param
    labelWidthMm: rollWidthMm - 6,
    labelHeightMm: 40,
    cols: 1,
    rows: 1,
    sideMm: 3,
    topMm: 3,
    gapXMm: 0,
    gapYMm: 0,
  };
}

export const LABEL_TEMPLATES: LabelTemplate[] = [
  L7160,
  L7163,
  L7654,
  CUSTOM_A4,
  thermal("thermal58", 58),
  thermal("thermal80", 80),
];

export function getTemplate(id: string | null): LabelTemplate {
  return LABEL_TEMPLATES.find((t) => t.id === id) ?? L7160;
}

/** Labels per A4 sheet. */
export function sheetCapacity(t: LabelTemplate): number {
  return t.cols * t.rows;
}

/**
 * Where label `index` (0-based, in print order) lands: page index and slot
 * within that page's grid. The start offset advances into the grid first,
 * so a partially used sheet begins at slot `start - 1` and every following
 * label keeps the product's pitch. Slots before the start never render —
 * the offset is taken modulo the sheet so no blank leading sheet is ever
 * printed (start 22 on a 21-up sheet is simply a fresh sheet).
 */
export function placement(
  t: LabelTemplate,
  index: number,
  start: number,
): { page: number; slot: number } {
  if (t.kind === "thermal") return { page: index, slot: 0 };
  const local = Math.max(0, start - 1) % sheetCapacity(t);
  const slot = (local + index) % sheetCapacity(t);
  return { page: Math.floor((local + index) / sheetCapacity(t)), slot };
}

/** How many paper pages the run needs (A4 counts sheets, thermal = labels). */
export function pageCount(
  t: LabelTemplate,
  count: number,
  start: number,
): number {
  if (count <= 0) return 0;
  if (t.kind === "thermal") return count;
  const local = Math.max(0, start - 1) % sheetCapacity(t);
  return Math.floor((local + count - 1) / sheetCapacity(t)) + 1;
}

/** Absolute position of a slot on one sheet, from the sheet origin. */
export function slotPosition(
  t: LabelTemplate,
  slot: number,
): { xMm: number; yMm: number } {
  const col = slot % t.cols;
  const row = Math.floor(slot / t.cols);
  return {
    xMm: t.sideMm + col * (t.labelWidthMm + t.gapXMm),
    yMm: t.topMm + row * (t.labelHeightMm + t.gapYMm),
  };
}
