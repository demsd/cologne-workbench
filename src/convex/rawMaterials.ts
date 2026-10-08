import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  materialCategoryValidator,
  olfactiveGroupValidator,
} from "./schema";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  STARTER_MATERIALS,
} from "./starterMaterials";

/**
 * All raw materials, sorted by name. Feeds the ingredient dropdown on the
 * formula composer; the inventory module builds on the same table later.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const materials = await ctx.db.query("rawMaterials").collect();
    return materials.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Idempotently installs the starter shelf the first time the app opens, so the
 * ingredient dropdown is never empty. Safe to call on every load: it only
 * inserts materials whose name is not on the shelf yet.
 */
export const ensureStarterKit = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("rawMaterials").collect();
    const have = new Set(existing.map((m) => m.name.toLowerCase()));
    let inserted = 0;

    for (const material of STARTER_MATERIALS) {
      if (have.has(material.name.toLowerCase())) continue;
      await ctx.db.insert("rawMaterials", {
        name: material.name,
        category: material.category,
        olfactiveGroup: material.olfactiveGroup,
        initialGrams: material.initialGrams,
        remainingGrams: material.initialGrams,
        price: material.price,
        vendor: material.vendor,
        lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
      });
      inserted += 1;
    }

    return { inserted, total: existing.length + inserted };
  },
});

/** Add a single raw material (used by the composer when a note is missing). */
export const add = mutation({
  args: {
    name: v.string(),
    category: materialCategoryValidator,
    olfactiveGroup: olfactiveGroupValidator,
    initialGrams: v.number(),
    price: v.number(),
    vendor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("A material needs a name.");
    if (args.initialGrams < 0 || args.price < 0) {
      throw new Error("Grams and price cannot be negative.");
    }
    const dupe = await ctx.db
      .query("rawMaterials")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (dupe) throw new Error(`“${name}” is already on the shelf.`);

    return await ctx.db.insert("rawMaterials", {
      name,
      category: args.category,
      olfactiveGroup: args.olfactiveGroup,
      initialGrams: args.initialGrams,
      remainingGrams: args.initialGrams,
      price: args.price,
      vendor: args.vendor?.trim() || undefined,
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    });
  },
});
