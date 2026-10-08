import type { MaterialCategory, OlfactiveGroup } from "./schema";

export type StarterMaterial = {
  name: string;
  category: MaterialCategory;
  olfactiveGroup: OlfactiveGroup;
  initialGrams: number;
  price: number;
  vendor: string;
};

/**
 * A working starter shelf so the ingredient dropdown is useful on first open.
 * Prices are plausible shelf prices; the inventory module (post-v1) edits them.
 */
export const STARTER_MATERIALS: StarterMaterial[] = [
  // — Top —
  {
    name: "Bergamot Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Top",
    initialGrams: 100,
    price: 18.5,
    vendor: "Hermitage",
  },
  {
    name: "Lemon Oil, cold-pressed",
    category: "Fragrance Oil",
    olfactiveGroup: "Top",
    initialGrams: 50,
    price: 9.75,
    vendor: "Hermitage",
  },
  {
    name: "Sweet Orange Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Top",
    initialGrams: 250,
    price: 12.4,
    vendor: "Apothecary Extracts",
  },
  {
    name: "Grapefruit Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Top",
    initialGrams: 50,
    price: 11.2,
    vendor: "Hermitage",
  },
  {
    name: "Lemongrass Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Top",
    initialGrams: 100,
    price: 7.9,
    vendor: "Apothecary Extracts",
  },
  {
    name: "Peppermint Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Top",
    initialGrams: 50,
    price: 8.6,
    vendor: "Apothecary Extracts",
  },
  {
    name: "Petitgrain Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Top",
    initialGrams: 100,
    price: 14.0,
    vendor: "Hermitage",
  },
  {
    name: "Pink Pepper CO₂",
    category: "Fragrance Oil",
    olfactiveGroup: "Top",
    initialGrams: 25,
    price: 21.5,
    vendor: "Pell Wall",
  },
  // — Middle —
  {
    name: "Lavender Oil, fine",
    category: "Fragrance Oil",
    olfactiveGroup: "Middle",
    initialGrams: 100,
    price: 16.8,
    vendor: "Hermitage",
  },
  {
    name: "Rose Absolute",
    category: "Fragrance Oil",
    olfactiveGroup: "Middle",
    initialGrams: 10,
    price: 68.0,
    vendor: "Pell Wall",
  },
  {
    name: "Jasmine Sambac Absolute",
    category: "Fragrance Oil",
    olfactiveGroup: "Middle",
    initialGrams: 10,
    price: 74.5,
    vendor: "Pell Wall",
  },
  {
    name: "Neroli Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Middle",
    initialGrams: 25,
    price: 46.0,
    vendor: "Hermitage",
  },
  {
    name: "Ylang Ylang Extra",
    category: "Fragrance Oil",
    olfactiveGroup: "Middle",
    initialGrams: 50,
    price: 27.9,
    vendor: "Apothecary Extracts",
  },
  {
    name: "Geranium Bourbon Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Middle",
    initialGrams: 100,
    price: 19.6,
    vendor: "Hermitage",
  },
  {
    name: "Clove Bud Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Middle",
    initialGrams: 50,
    price: 8.25,
    vendor: "Apothecary Extracts",
  },
  {
    name: "Cinnamon Bark Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Middle",
    initialGrams: 50,
    price: 13.4,
    vendor: "Apothecary Extracts",
  },
  // — Base —
  {
    name: "Sandalwood, Australian",
    category: "Fragrance Oil",
    olfactiveGroup: "Base",
    initialGrams: 50,
    price: 39.0,
    vendor: "Pell Wall",
  },
  {
    name: "Vanilla Absolute",
    category: "Fragrance Oil",
    olfactiveGroup: "Base",
    initialGrams: 25,
    price: 42.5,
    vendor: "Pell Wall",
  },
  {
    name: "Patchouli Oil, aged",
    category: "Fragrance Oil",
    olfactiveGroup: "Base",
    initialGrams: 100,
    price: 17.25,
    vendor: "Hermitage",
  },
  {
    name: "Virginia Cedarwood Oil",
    category: "Fragrance Oil",
    olfactiveGroup: "Base",
    initialGrams: 250,
    price: 15.0,
    vendor: "Apothecary Extracts",
  },
  {
    name: "Vetiver Oil, Haiti",
    category: "Fragrance Oil",
    olfactiveGroup: "Base",
    initialGrams: 50,
    price: 31.5,
    vendor: "Hermitage",
  },
  {
    name: "Benzoin Resinoid",
    category: "Fixative",
    olfactiveGroup: "Base",
    initialGrams: 50,
    price: 22.0,
    vendor: "Apothecary Extracts",
  },
  // — Fixative —
  {
    name: "Labdanum Resinoid",
    category: "Fixative",
    olfactiveGroup: "Fixative",
    initialGrams: 50,
    price: 24.8,
    vendor: "Hermitage",
  },
  {
    name: "Ambroxan, crystalline",
    category: "Fixative",
    olfactiveGroup: "Fixative",
    initialGrams: 25,
    price: 36.0,
    vendor: "Pell Wall",
  },
  {
    name: "Galaxolide 50%",
    category: "Fixative",
    olfactiveGroup: "Fixative",
    initialGrams: 250,
    price: 19.9,
    vendor: "Pell Wall",
  },
  // — Base solvent —
  {
    name: "Perfumer's Alcohol, 96°",
    category: "Alcohol",
    olfactiveGroup: "Alcohol",
    initialGrams: 1000,
    price: 14.5,
    vendor: "Apothecary Extracts",
  },
];

/** Grams left of a material on the shelf before anything is weighed out. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 56.7;
