import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  formulaStatusValidator,
  olfactiveGroupValidator,
} from "./schema";
import type { Id } from "./_generated/dataModel";
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
