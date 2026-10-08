import type {
  MaterialCategory,
  OlfactiveGroup,
} from "../convex/schema";

/**
 * The reorder lines the bench works by: fragrance oils run low at 56 g
 * (two ounces), while the bulk categories — alcohol and fixatives — reorder
 * at 453 g (a pound). A `null` rule means "use the material's own reorder
 * line" (diluents have no stated rule yet).
 */
export const RESTOCK_RULES: Record<MaterialCategory, number | null> = {
  "Fragrance Oil": 56,
  Alcohol: 453,
  Fixative: 453,
  Diluent: null,
};

export type RestockMaterial = {
  name: string;
  category: MaterialCategory;
  olfactiveGroup: OlfactiveGroup;
  remainingGrams: number;
  lowStockThreshold?: number;
  vendor?: string;
  price: number;
  pricePerGram: number;
};

export type RestockRow = {
  name: string;
  category: MaterialCategory;
  olfactiveGroup: OlfactiveGroup;
  vendor: string | undefined;
  remainingGrams: number;
  reorderAtGrams: number;
  shortfallGrams: number;
  /** How depleted against its own line: 0 = empty, 1 = exactly at the line. */
  depletion: number;
  price: number;
  pricePerGram: number;
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;

/** The line this material reorders at — stock strictly below it triggers. */
export function reorderAtGrams(material: RestockMaterial): number {
  const rule = RESTOCK_RULES[material.category];
  return rule ?? material.lowStockThreshold ?? 56.7;
}

/**
 * Every material under its line, most depleted first — then grouped by
 * vendor (alphabetically, unvendoried last) by the report.
 */
export function buildRestockRows(
  materials: RestockMaterial[],
): RestockRow[] {
  const rows: RestockRow[] = [];

  for (const material of materials) {
    const reorderAt = reorderAtGrams(material);
    if (!(material.remainingGrams < reorderAt)) continue;
    rows.push({
      name: material.name,
      category: material.category,
      olfactiveGroup: material.olfactiveGroup,
      vendor: material.vendor,
      remainingGrams: material.remainingGrams,
      reorderAtGrams: reorderAt,
      shortfallGrams: round4(reorderAt - material.remainingGrams),
      depletion:
        reorderAt > 0
          ? round4((reorderAt - material.remainingGrams) / reorderAt)
          : 0,
      price: material.price,
      pricePerGram: material.pricePerGram,
    });
  }

  rows.sort(
    (a, b) =>
      b.depletion - a.depletion || a.name.localeCompare(b.name),
  );
  return rows;
}

export type RestockGroup = {
  /** undefined = materials with no vendor listed. */
  vendor: string | undefined;
  rows: RestockRow[];
  shortfallGrams: number;
};

/** Rows bucketed by vendor: alphabetical, unvendoried last. */
export function groupByVendor(rows: RestockRow[]): RestockGroup[] {
  const buckets = new Map<string | undefined, RestockRow[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.vendor);
    if (bucket) bucket.push(row);
    else buckets.set(row.vendor, [row]);
  }

  return [...buckets.entries()]
    .map(([vendor, groupRows]) => ({
      vendor,
      rows: groupRows,
      shortfallGrams: round4(
        groupRows.reduce((sum, row) => sum + row.shortfallGrams, 0),
      ),
    }))
    .sort((a, b) => {
      if (a.vendor === undefined) return 1;
      if (b.vendor === undefined) return -1;
      return a.vendor.localeCompare(b.vendor);
    });
}
