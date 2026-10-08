import type {
  MaterialCategory,
  OlfactiveGroup,
} from "../convex/schema";
import { MATERIAL_CATEGORIES, OLFACTIVE_GROUPS } from "../convex/schema";

/** Split one CSV line, honouring double-quoted fields ("")). */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Split CSV text into rows of cells, skipping blank lines. */
export function parseCsv(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine);
}

export function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ---------------------------------------------------------------------------
// Vendor price-list format (per the PRD):
//   Fragrance Name, Group, Initial Grams, Remaining Grams, Price,
//   Price per Gram (ignored — we compute it), Vendor [, Category]
// ---------------------------------------------------------------------------

export type InventoryCsvRow = {
  name: string;
  olfactiveGroup: OlfactiveGroup;
  initialGrams: number;
  remainingGrams: number;
  price: number;
  vendor: string | undefined;
  category: MaterialCategory;
};

export type InventoryCsvPreview = {
  rows: InventoryCsvRow[];
  errors: string[];
};

/** Tolerates "$1,234.50", "28.35 g" leftovers and stray whitespace. */
function toNumber(cell: string): number {
  const cleaned = cell.replace(/[$,\s]/g, "");
  return Number(cleaned);
}

function matchGroup(cell: string): OlfactiveGroup | null {
  const key = cell.trim().toLowerCase();
  if (!key) return null;
  return (
    OLFACTIVE_GROUPS.find(
      (group) => group.toLowerCase() === key || group.toLowerCase().startsWith(key),
    ) ?? null
  );
}

function matchCategory(cell: string): MaterialCategory | null {
  const key = cell.trim().toLowerCase();
  return (
    MATERIAL_CATEGORIES.find((category) => category.toLowerCase() === key) ?? null
  );
}

/**
 * Parse a pasted/uploaded price list into validated rows plus human-readable
 * problems — the import dialog shows both before anything is written.
 */
export function parseInventoryCsv(text: string): InventoryCsvPreview {
  const grid = parseCsv(text);
  const rows: InventoryCsvRow[] = [];
  const errors: string[] = [];

  let start = 0;
  const first = grid[0]?.[0]?.toLowerCase() ?? "";
  if (first.includes("name")) start = 1; // header row

  for (let i = start; i < grid.length; i += 1) {
    const line = i + 1;
    const cells = grid[i];
    if (cells.length < 7) {
      errors.push(
        `Line ${line}: expected 7 columns (name, group, initial g, remaining g, price, $/g, vendor) — found ${cells.length}.`,
      );
      continue;
    }

    const name = cells[0];
    if (!name) {
      errors.push(`Line ${line}: missing material name.`);
      continue;
    }
    const group = matchGroup(cells[1]);
    if (!group) {
      errors.push(`Line ${line}: “${cells[1] || "—"}” is not Top/Middle/Base/Fixative.`);
      continue;
    }
    const initialGrams = toNumber(cells[2]);
    const remainingGrams = toNumber(cells[3]);
    const price = toNumber(cells[4]);
    if (
      !Number.isFinite(initialGrams) ||
      !Number.isFinite(remainingGrams) ||
      !Number.isFinite(price) ||
      initialGrams < 0 ||
      remainingGrams < 0 ||
      price < 0
    ) {
      errors.push(
        `Line ${line}: grams and price must be numbers at or above zero.`,
      );
      continue;
    }

    // A row grouped as Alcohol is obviously an Alcohol-category material even
    // when the optional Category column is blank.
    const category = cells[7]
      ? matchCategory(cells[7])
      : group === "Alcohol"
        ? "Alcohol"
        : null;
    if (cells[7] && !category) {
      errors.push(
        `Line ${line}: “${cells[7]}” is not a known category (Alcohol, Fragrance Oil, Fixative, Diluent).`,
      );
      continue;
    }

    rows.push({
      name,
      olfactiveGroup: group,
      initialGrams,
      remainingGrams,
      price,
      vendor: cells[6] || undefined,
      category: category ?? "Fragrance Oil",
    });
  }

  return { rows, errors };
}

/** Round-trips the shelf back out in the same vendor price-list format. */
export function toInventoryCsv(
  materials: {
    name: string;
    olfactiveGroup: OlfactiveGroup;
    category: MaterialCategory;
    initialGrams: number;
    remainingGrams: number;
    price: number;
    pricePerGram: number;
    vendor?: string;
  }[],
): string {
  const header =
    "Fragrance Name,Group,Initial Grams,Remaining Grams,Price,Price per Gram,Vendor,Category";
  const body = materials.map((m) =>
    [
      m.name,
      m.olfactiveGroup,
      m.initialGrams,
      m.remainingGrams,
      m.price,
      m.pricePerGram,
      m.vendor ?? "",
      m.category,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...body].join("\n");
}
