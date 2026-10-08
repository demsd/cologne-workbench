import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  formulaStatusValidator,
  olfactiveGroupValidator,
} from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import {
  GRAM_DECIMALS,
  PCT_DECIMALS,
  computePercentages,
  roundTo,
} from "../lib/formula-math";

const ingredientInput = v.object({
  rawMaterialId: v.id("rawMaterials"),
  olfactiveGroup: olfactiveGroupValidator,
  amountGrams: v.number(),
});

/** The ledger view: every formula, newest first, with denormalised totals. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const formulas = await ctx.db.query("formulas").order("desc").collect();
    return formulas;
  },
});

/** One formula version plus its ingredients, in the order they were weighed. */
export const get = query({
  args: { id: v.id("formulas") },
  handler: async (ctx, { id }) => {
    const formula = await ctx.db.get(id);
    if (!formula) return null;

    const items = await ctx.db
      .query("formulaItems")
      .withIndex("by_formula", (q) => q.eq("formulaId", id))
      .collect();
    items.sort((a, b) => a.sortOrder - b.sortOrder);

    const parent = formula.parentId ? await ctx.db.get(formula.parentId) : null;

    return {
      ...formula,
      items,
      parentVersion: parent ? parent.versionNumber : null,
    };
  },
});

/**
 * Delete one formula version. Lineage survives: children are re-linked to the
 * deleted node's parent (or become roots). Weighing records made from this
 * version are deleted with it, so no batch is ever left pointing at a formula
 * that no longer exists — the UI confirms this before calling.
 */
export const remove = mutation({
  args: { id: v.id("formulas") },
  handler: async (ctx, { id }) => {
    const formula = await ctx.db.get(id);
    if (!formula) throw new Error("That version is missing.");

    // Batches weighed from this version go with it (no orphaned records).
    const batches = await ctx.db
      .query("productionBatches")
      .withIndex("by_formula", (q) => q.eq("formulaId", id))
      .collect();
    for (const batch of batches) {
      const batchItems = await ctx.db
        .query("batchItems")
        .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
        .collect();
      for (const item of batchItems) await ctx.db.delete(item._id);
      await ctx.db.delete(batch._id);
    }

    // Re-link children before removing the node so the lineage never dangles.
    const children = await ctx.db
      .query("formulas")
      .withIndex("by_parent", (q) => q.eq("parentId", id))
      .collect();
    for (const child of children) {
      await ctx.db.patch(child._id, { parentId: formula.parentId });
    }

    const items = await ctx.db
      .query("formulaItems")
      .withIndex("by_formula", (q) => q.eq("formulaId", id))
      .collect();
    for (const item of items) await ctx.db.delete(item._id);
    await ctx.db.delete(id);

    return {
      removedName: formula.name,
      removedVersion: formula.versionNumber,
      relinkedChildren: children.length,
      removedBatches: batches.length,
      removedItems: items.length,
    };
  },
});

/**
 * The whole version family this formula belongs to: walks up to the root of
 * the parent chain, then collects every descendant (breadth-first, so
 * branches survive), returned oldest first.
 */
export const lineage = query({
  args: { id: v.id("formulas") },
  handler: async (ctx, { id }) => {
    // — Walk up to the root, cycle-safe —
    let rootId: Id<"formulas"> = id;
    const guard = new Set<string>([id]);
    for (let hop = 0; hop < 100; hop += 1) {
      const node = await ctx.db.get(rootId);
      if (!node || !node.parentId || guard.has(node.parentId)) break;
      guard.add(node.parentId);
      rootId = node.parentId;
    }

    // — Breadth-first over descendants —
    const chain: Doc<"formulas">[] = [];
    let frontier: Id<"formulas">[] = [rootId];
    while (frontier.length > 0) {
      const next: Id<"formulas">[] = [];
      for (const formulaId of frontier) {
        const formula = await ctx.db.get(formulaId);
        if (!formula) continue;
        chain.push(formula);
        const children = await ctx.db
          .query("formulas")
          .withIndex("by_parent", (q) => q.eq("parentId", formulaId))
          .collect();
        for (const child of children) next.push(child._id);
      }
      frontier = next;
    }

    chain.sort((a, b) => a._creationTime - b._creationTime);
    return chain.map((formula) => ({
      _id: formula._id,
      versionNumber: formula.versionNumber,
      status: formula.status,
      versionDescription: formula.versionDescription,
      parentId: formula.parentId,
      _creationTime: formula._creationTime,
    }));
  },
});

/**
 * File a formula: validates the particulars, weighs every ingredient to 4dp,
 * settles percentages to exactly 100.00, then writes the formula and its
 * ingredient rows in one transaction.
 */
export const create = mutation({
  args: {
    name: v.string(),
    status: formulaStatusValidator,
    versionNumber: v.string(),
    versionDescription: v.optional(v.string()),
    batchWeightGrams: v.number(),
    concentrationPct: v.number(),
    bottleVolumeMl: v.optional(v.number()),
    minDropGrams: v.number(),
    /** The version this entry revises — makes it a child node (v1 → v1.1). */
    parentId: v.optional(v.id("formulas")),
    items: v.array(ingredientInput),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const versionNumber = args.versionNumber.trim();

    if (!name) throw new Error("The formula needs a name.");
    if (!versionNumber) throw new Error("The version number cannot be empty.");
    if (!(args.batchWeightGrams > 0)) {
      throw new Error("Batch weight must be greater than zero grams.");
    }
    if (!(args.concentrationPct > 0 && args.concentrationPct <= 100)) {
      throw new Error("Concentration must be between 0 and 100 percent.");
    }
    if (args.bottleVolumeMl !== undefined && args.bottleVolumeMl <= 0) {
      throw new Error("Bottle volume must be greater than zero millilitres.");
    }
    if (!(args.minDropGrams > 0)) {
      throw new Error("Minimum drop must be greater than zero grams.");
    }
    if (args.items.length === 0) {
      throw new Error("Add at least one ingredient before filing.");
    }
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("The version being revised is missing.");
    }

    // Validate materials and weigh them to a fixed precision.
    const weighed: {
      rawMaterialId: Id<"rawMaterials">;
      materialName: string;
      olfactiveGroup: "Top" | "Middle" | "Base" | "Fixative";
      amountGrams: number;
    }[] = [];

    for (const item of args.items) {
      const material = await ctx.db.get(item.rawMaterialId);
      if (!material) throw new Error("One of the ingredients is missing.");
      if (!(item.amountGrams > 0)) {
        throw new Error(`“${material.name}” needs an amount above zero grams.`);
      }
      const grams = roundTo(item.amountGrams, GRAM_DECIMALS);
      if (grams < args.minDropGrams) {
        throw new Error(
          `“${material.name}” is below the minimum drop of ${args.minDropGrams} g.`,
        );
      }
      weighed.push({
        rawMaterialId: item.rawMaterialId,
        materialName: material.name,
        olfactiveGroup: item.olfactiveGroup,
        amountGrams: grams,
      });
    }

    const totalGrams = roundTo(
      weighed.reduce((sum, w) => sum + w.amountGrams, 0),
      GRAM_DECIMALS,
    );
    if (!(totalGrams > 0)) {
      throw new Error("The formula weighs nothing in total.");
    }

    const percentages = computePercentages(weighed.map((w) => w.amountGrams));

    const formulaId = await ctx.db.insert("formulas", {
      name,
      status: args.status,
      versionNumber,
      versionDescription: args.versionDescription?.trim() || undefined,
      batchWeightGrams: roundTo(args.batchWeightGrams, GRAM_DECIMALS),
      concentrationPct: roundTo(args.concentrationPct, PCT_DECIMALS),
      bottleVolumeMl:
        args.bottleVolumeMl !== undefined
          ? roundTo(args.bottleVolumeMl, PCT_DECIMALS)
          : undefined,
      minDropGrams: roundTo(args.minDropGrams, GRAM_DECIMALS),
      ingredientCount: weighed.length,
      totalGrams,
      parentId: args.parentId,
    });

    for (const [index, item] of weighed.entries()) {
      await ctx.db.insert("formulaItems", {
        formulaId,
        rawMaterialId: item.rawMaterialId,
        materialName: item.materialName,
        olfactiveGroup: item.olfactiveGroup,
        amountGrams: item.amountGrams,
        percentage: percentages[index],
        sortOrder: index,
      });
    }

    return formulaId;
  },
});
