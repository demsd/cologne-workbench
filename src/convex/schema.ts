import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// ---------------------------------------------------------------------------
// Cologne Workbench — value objects (mirrors the PRD's MySQL ENUMs)
// ---------------------------------------------------------------------------

export const MATERIAL_CATEGORIES = [
  "Alcohol",
  "Fragrance Oil",
  // Pre-blended scent blocks — bought or mixed, they behave like a material.
  "Accord",
  "Fixative",
  "Diluent",
  // Product bases — the body-care and candle lines the bench also formulates.
  "Bar Soap Base",
  "Beard Oil Base",
  "Body Wash Base",
  "Candle Wax",
  "Conditioner Base",
  "Facial Cleanser Base",
  "Lotion Base",
  "Shampoo Base",
  "Solubilizer",
] as const;
export const materialCategoryValidator = v.union(
  ...MATERIAL_CATEGORIES.map((c) => v.literal(c)),
);
export type MaterialCategory = Infer<typeof materialCategoryValidator>;

export const OLFACTIVE_GROUPS = [
  "Top",
  "Middle",
  "Base",
  "Fixative",
  // Carriers weigh in as their own group — vendor price lists and real
  // batches both treat perfumer's alcohol as a line item, not a note.
  "Alcohol",
  // Accords likewise stand apart from the pyramid: they are blends, not
  // single notes, and the bench weighs them as line items.
  "Accord",
  // Product bases group under their own name too, so a soap- or candle-base
  // line reads as itself on the sheet instead of masquerading as a note.
  "Bar Soap Base",
  "Beard Oil Base",
  "Body Wash Base",
  "Candle Wax",
  "Conditioner Base",
  "Facial Cleanser Base",
  "Lotion Base",
  "Shampoo Base",
  "Solubilizer",
] as const;
export const olfactiveGroupValidator = v.union(
  ...OLFACTIVE_GROUPS.map((g) => v.literal(g)),
);
export type OlfactiveGroup = Infer<typeof olfactiveGroupValidator>;

export const FORMULA_STATUSES = ["Experiment", "Production"] as const;
export const formulaStatusValidator = v.union(
  ...FORMULA_STATUSES.map((s) => v.literal(s)),
);
export type FormulaStatus = Infer<typeof formulaStatusValidator>;

const schema = defineSchema(
  {
    // -----------------------------------------------------------------------
    // 1. Inventory & raw materials (feeds the ingredient dropdowns; the full
    //    inventory UI arrives after version 1).
    // -----------------------------------------------------------------------
    rawMaterials: defineTable({
      name: v.string(),
      category: materialCategoryValidator,
      olfactiveGroup: olfactiveGroupValidator,
      initialGrams: v.number(),
      remainingGrams: v.number(),
      /** Total cost of the initial package in USD. */
      price: v.number(),
      vendor: v.optional(v.string()),
      lowStockThreshold: v.optional(v.number()),
      /** Characteristic facets ("rose", "citrus", "smoky") for the picker. */
      notes: v.optional(v.array(v.string())),
    })
      .index("by_name", ["name"])
      // PRD: index the filter columns so the note picker stays instantaneous.
      .index("by_group", ["olfactiveGroup"])
      .index("by_category", ["category"]),

    // -----------------------------------------------------------------------
    // 2. Formulas — parent/child versioning (parentId links a new version to
    //    the one it was revised from; v1 only creates fresh formulas).
    // -----------------------------------------------------------------------
    formulas: defineTable({
      name: v.string(),
      status: formulaStatusValidator,
      versionNumber: v.string(),
      versionDescription: v.optional(v.string()),
      batchWeightGrams: v.number(),
      concentrationPct: v.number(),
      bottleVolumeMl: v.optional(v.number()),
      minDropGrams: v.number(),
      /** Denormalised so the ledger list renders without a second query. */
      ingredientCount: v.number(),
      /** Sum of all ingredient grams actually recorded in this version. */
      totalGrams: v.number(),
      /** The version this one was revised from (parent-child versioning). */
      parentId: v.optional(v.id("formulas")),
    }).index("by_parent", ["parentId"]),

    // -----------------------------------------------------------------------
    // 3. Formula items — one row per ingredient of a formula version.
    // -----------------------------------------------------------------------
    formulaItems: defineTable({
      formulaId: v.id("formulas"),
      rawMaterialId: v.id("rawMaterials"),
      /** Snapshot of the material name at filing time (traceability). */
      materialName: v.string(),
      olfactiveGroup: olfactiveGroupValidator,
      amountGrams: v.number(),
      percentage: v.number(),
      sortOrder: v.number(),
    }).index("by_formula", ["formulaId"]),

    // -----------------------------------------------------------------------
    // Lab settings — single row; the starter shelf is seeded once, ever.
    // -----------------------------------------------------------------------
    labSettings: defineTable({
      shelfSeeded: v.boolean(),
    }),

    // -----------------------------------------------------------------------
    // 4. Production batches — immutable records of completed weighing
    //    sessions (the Lab Journal history page reads these later).
    // -----------------------------------------------------------------------
    productionBatches: defineTable({
      formulaId: v.id("formulas"),
      batchNumber: v.string(),
      plannedTotalWeightGrams: v.number(),
      actualTotalWeightGrams: v.number(),
      notes: v.optional(v.string()),
    })
      .index("by_formula", ["formulaId"])
      .index("by_batch_number", ["batchNumber"]),

    batchItems: defineTable({
      batchId: v.id("productionBatches"),
      rawMaterialId: v.id("rawMaterials"),
      /** Snapshot of the material name at weighing time (traceability). */
      materialName: v.string(),
      olfactiveGroup: olfactiveGroupValidator,
      /** The target the bench directed at pour time (may be rescaled). */
      targetGrams: v.number(),
      actualGrams: v.number(),
      sortOrder: v.number(),
    }).index("by_batch", ["batchId"]),

    // -----------------------------------------------------------------------
    // 5. Label queue — one row per pour, filed automatically when the batch
    //    is created (PRD: labels queue upon creating production batches).
    //    The particulars are snapshotted here so a label prints the same
    //    forever, exactly like the batch record it came from.
    // -----------------------------------------------------------------------
    labels: defineTable({
      batchId: v.id("productionBatches"),
      batchNumber: v.string(),
      formulaName: v.string(),
      formulaVersion: v.string(),
      concentrationPct: v.number(),
      /** The actual total weighed — the amount printed on the label. */
      totalAmountGrams: v.number(),
      status: v.union(v.literal("queued"), v.literal("printed")),
      printedAt: v.optional(v.number()),
    })
      // One label per batch: enqueue stays idempotent.
      .index("by_batch", ["batchId"])
      .index("by_status", ["status"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
