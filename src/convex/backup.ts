import { query } from "./_generated/server";

/**
 * The whole ledger in one consistent read — everything a backup needs:
 * the shelf, every formula version with its ingredients, and every
 * production record with its weigh-ins. User accounts are deliberately
 * not part of a data backup; the file is data, not identity.
 */
export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const rawMaterials = await ctx.db.query("rawMaterials").collect();
    const formulas = await ctx.db.query("formulas").collect();
    const formulaItems = await ctx.db.query("formulaItems").collect();
    const productionBatches = await ctx.db
      .query("productionBatches")
      .collect();
    const batchItems = await ctx.db.query("batchItems").collect();

    return {
      rawMaterials,
      formulas,
      formulaItems,
      productionBatches,
      batchItems,
    };
  },
});
