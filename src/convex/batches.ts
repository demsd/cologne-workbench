import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { olfactiveGroupValidator } from "./schema";
import { GRAM_DECIMALS, roundTo } from "../lib/formula-math";

const batchItemInput = v.object({
  rawMaterialId: v.id("rawMaterials"),
  olfactiveGroup: olfactiveGroupValidator,
  /** The target the bench directed at pour time (rescaled if adjusted). */
  targetGrams: v.number(),
  actualGrams: v.number(),
});

/**
 * File a completed weighing session as an immutable production batch:
 * batch number, exact actual weights, and a link back to the exact formula
 * version weighed. There are deliberately no update/delete functions —
 * records of the bench are never rewritten.
 */
export const create = mutation({
  args: {
    formulaId: v.id("formulas"),
    plannedTotalWeightGrams: v.number(),
    notes: v.optional(v.string()),
    items: v.array(batchItemInput),
  },
  handler: async (ctx, args) => {
    const formula = await ctx.db.get(args.formulaId);
    if (!formula) throw new Error("That formula version is missing.");
    if (args.items.length === 0) {
      throw new Error("A weighing record needs at least one material.");
    }
    if (!(args.plannedTotalWeightGrams > 0)) {
      throw new Error("The planned total must be above zero grams.");
    }

    // The record must cover the formula version exactly — every ingredient
    // once, nothing foreign.
    const formulaItems = await ctx.db
      .query("formulaItems")
      .withIndex("by_formula", (q) => q.eq("formulaId", args.formulaId))
      .collect();
    const names = new Map(
      formulaItems.map((item) => [item.rawMaterialId as string, item.materialName]),
    );
    const seen = new Set<string>();

    for (const item of args.items) {
      if (!(item.actualGrams > 0)) {
        throw new Error("Every recorded material needs an actual weight above zero grams.");
      }
      if (item.targetGrams < 0) {
        throw new Error("Targets cannot be negative.");
      }
      const key = item.rawMaterialId as string;
      if (!names.has(key)) {
        throw new Error("One of these materials is not part of this formula version.");
      }
      if (seen.has(key)) {
        throw new Error("A material appears twice in the weighing record.");
      }
      seen.add(key);
    }
    if (seen.size !== names.size) {
      throw new Error("The record must cover every ingredient of the formula version.");
    }

    const weighed = args.items.map((item) => ({
      rawMaterialId: item.rawMaterialId,
      materialName: names.get(item.rawMaterialId as string) ?? "Unknown material",
      olfactiveGroup: item.olfactiveGroup,
      targetGrams: roundTo(item.targetGrams, GRAM_DECIMALS),
      actualGrams: roundTo(item.actualGrams, GRAM_DECIMALS),
    }));
    const actualTotal = roundTo(
      weighed.reduce((sum, item) => sum + item.actualGrams, 0),
      GRAM_DECIMALS,
    );

    // B-0001, B-0002, … — derived from the HIGHEST existing number, not the
    // count, so deleting an older batch can never make two batches share a
    // number. Convex mutations are serialisable, so this is race-free.
    const existing = await ctx.db.query("productionBatches").collect();
    const highest = existing.reduce((max, batch) => {
      const parsed = Number(batch.batchNumber.replace(/^B-/, ""));
      return Number.isFinite(parsed) && parsed > max ? parsed : max;
    }, 0);
    const batchNumber = `B-${String(highest + 1).padStart(4, "0")}`;

    const batchId = await ctx.db.insert("productionBatches", {
      formulaId: args.formulaId,
      batchNumber,
      plannedTotalWeightGrams: roundTo(args.plannedTotalWeightGrams, GRAM_DECIMALS),
      actualTotalWeightGrams: actualTotal,
      notes: args.notes?.trim() || undefined,
    });

    for (const [index, item] of weighed.entries()) {
      await ctx.db.insert("batchItems", { batchId, ...item, sortOrder: index });
    }

    return { batchId, batchNumber, actualTotalWeightGrams: actualTotal };
  },
});

/** The most recent weighing records, newest first (Lab Journal reads these). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query("productionBatches").order("desc").collect();
    return batches.slice(0, 50);
  },
});

/** One batch with its exact actual weights, in weighing order. */
export const get = query({
  args: { id: v.id("productionBatches") },
  handler: async (ctx, { id }) => {
    const batch = await ctx.db.get(id);
    if (!batch) return null;
    const items = await ctx.db
      .query("batchItems")
      .withIndex("by_batch", (q) => q.eq("batchId", id))
      .collect();
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    const formula = await ctx.db.get(batch.formulaId);
    return {
      ...batch,
      items,
      formulaName: formula?.name ?? null,
      formulaVersion: formula?.versionNumber ?? null,
    };
  },
});
