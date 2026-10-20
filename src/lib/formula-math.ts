import type { OlfactiveGroup } from "../convex/schema";

export const GRAM_DECIMALS = 4; // strict rounding: prevents float drift (PRD note)
export const PCT_DECIMALS = 2;

/** Display precision for the ledger: grams to 3dp, percentages to 2dp. */
export const DISPLAY_GRAM_DECIMALS = 3;

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/**
 * Percentages that always total exactly 100.00: each share is rounded to 2dp,
 * then the rounding remainder is settled on the largest ingredient.
 * The composer previews with this; `formulas.create` writes with its copy —
 * same algorithm, so what you see is what gets filed.
 */
export function computePercentages(amounts: number[]): number[] {
  const total = amounts.reduce((sum, g) => sum + g, 0);
  if (total <= 0) return amounts.map(() => 0);

  const raw = amounts.map((g) => roundTo((g / total) * 100, PCT_DECIMALS));
  const drift = roundTo(
    100 - raw.reduce((sum, p) => sum + p, 0),
    PCT_DECIMALS,
  );
  if (drift !== 0) {
    let biggest = 0;
    for (let i = 1; i < amounts.length; i += 1) {
      if (amounts[i] > amounts[biggest]) biggest = i;
    }
    raw[biggest] = roundTo(raw[biggest] + drift, PCT_DECIMALS);
  }
  return raw;
}

/**
 * The next revision label in a lineage, following the PRD's v1.0 → v1.1 idea:
 * V1 → V1.1, V1.1 → V1.2, v3.2 → v3.3. Unrecognised labels get “.1” appended.
 */
export function nextVersionNumber(current: string): string {
  const trimmed = current.trim();
  const match = trimmed.match(/^(v?)(\d+)(?:\.(\d+))?$/i);
  if (!match) return `${trimmed}.1`;
  const [, prefix, major, minor] = match;
  return minor === undefined
    ? `${prefix}${major}.1`
    : `${prefix}${major}.${Number(minor) + 1}`;
}

/**
 * The proportional rescaling engine behind the weighing bench: after the
 * pour at `atIndex`, do the remaining materials need to follow the batch to
 * its new scale? Returns null when the pour was on target (within
 * SCALE_TOLERANCE) or nothing is left to weigh.
 *
 * Factors are always computed from the DESIGN targets, never from previously
 * rescaled ones, so repeated rescales replace rather than compound.
 */
export const SCALE_TOLERANCE = 0.001; // 0.1% — closer counts as on target

export type RescalePlanStep = {
  materialName: string;
  originalTarget: number;
  currentTarget: number;
  actual?: number;
};

export type RescalePlan = {
  factor: number;
  preview: { name: string; from: number; to: number }[];
  /** Finished weight if the remaining targets are kept as they stand. */
  projectedKeep: number;
  /** Finished weight if the remaining targets follow the new scale. */
  projectedScale: number;
};

export function planRescale(
  steps: RescalePlanStep[],
  atIndex: number,
): RescalePlan | null {
  const through = steps.slice(0, atIndex + 1);
  const remaining = steps.slice(atIndex + 1);
  const plannedSoFar = through.reduce((sum, s) => sum + s.originalTarget, 0);
  const actualSoFar = through.reduce((sum, s) => sum + (s.actual ?? 0), 0);
  const factor = plannedSoFar > 0 ? actualSoFar / plannedSoFar : 1;

  if (remaining.length === 0) return null;
  if (Math.abs(factor - 1) <= SCALE_TOLERANCE) return null;

  return {
    factor,
    preview: remaining.map((s) => ({
      name: s.materialName,
      from: s.currentTarget,
      to: roundTo(s.originalTarget * factor, 4),
    })),
    projectedKeep:
      actualSoFar + remaining.reduce((sum, s) => sum + s.currentTarget, 0),
    projectedScale:
      actualSoFar +
      remaining.reduce((sum, s) => sum + s.originalTarget * factor, 0),
  };
}

/** Reading order of the olfactive subsections on every formula sheet. */
export const GROUP_ORDER: OlfactiveGroup[] = [
  "Top",
  "Middle",
  "Base",
  "Fixative",
  "Alcohol",
  "Accord",
  // Product bases follow the olfactive notes — same reading order the
  // composer, the ledger and the print sheet all share.
  "Bar Soap Base",
  "Beard Oil Base",
  "Body Wash Base",
  "Candle Wax",
  "Conditioner Base",
  "Facial Cleanser Base",
  "Lotion Base",
  "Shampoo Base",
  "Solubilizer",
];

export const GROUP_HEADINGS: Record<OlfactiveGroup, string> = {
  Top: "Top Notes",
  Middle: "Middle Notes",
  Base: "Base Notes",
  Fixative: "Fixatives",
  Alcohol: "Alcohol",
  Accord: "Accords",
  "Bar Soap Base": "Bar Soap Base",
  "Beard Oil Base": "Beard Oil Base",
  "Body Wash Base": "Body Wash Base",
  "Candle Wax": "Candle Wax",
  "Conditioner Base": "Conditioner Base",
  "Facial Cleanser Base": "Facial Cleanser Base",
  "Lotion Base": "Lotion Base",
  "Shampoo Base": "Shampoo Base",
  Solubilizer: "Solubilizer",
};

/** The subsections that actually have ingredients, in perfumery order. */
export function sortGroups(groups: Iterable<OlfactiveGroup>): OlfactiveGroup[] {
  const present = new Set(groups);
  return GROUP_ORDER.filter((g) => present.has(g));
}

/** Trimmed grams: up to 3dp, no trailing zeros (0.500 → "0.5"). */
export function formatGrams(value: number): string {
  const rounded = roundTo(value, DISPLAY_GRAM_DECIMALS);
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: DISPLAY_GRAM_DECIMALS,
  });
}

/** Percentages always shown to two places (5 → "5.00"). */
export function formatPct(value: number): string {
  return roundTo(value, PCT_DECIMALS).toFixed(PCT_DECIMALS);
}

/** Millilitres, or an em dash when the field was left blank. */
export function formatMl(value: number | undefined): string {
  if (value === undefined) return "—";
  return roundTo(value, 2).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
