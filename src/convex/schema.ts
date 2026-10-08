import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// ---------------------------------------------------------------------------
// Cologne Workbench — value objects (mirrors the PRD's MySQL ENUMs)
// ---------------------------------------------------------------------------

export const MATERIAL_CATEGORIES = [
  "Alcohol",
  "Fragrance Oil",
  "Fixative",
  "Diluent",
] as const;
export const materialCategoryValidator = v.union(
  ...MATERIAL_CATEGORIES.map((c) => v.literal(c)),
);
export type MaterialCategory = Infer<typeof materialCategoryValidator>;

export const OLFACTIVE_GROUPS = ["Top", "Middle", "Base", "Fixative"] as const;
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
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

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
    }).index("by_name", ["name"]),

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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
