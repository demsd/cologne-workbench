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
import { roundTo } from "../lib/formula-math";

/**
 * All raw materials, sorted by name, with the derived price-per-gram and a
 * low-stock flag (remaining at or under the material's threshold). Feeds the
 * inventory page, the composer dropdown and the dashboard stats.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const materials = await ctx.db.query("rawMaterials").collect();
    return materials
      .map((material) => ({
        ...material,
        pricePerGram:
          material.initialGrams > 0
            ? roundTo(material.price / material.initialGrams, 4)
            : 0,
        isLow:
          material.remainingGrams <=
          (material.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Installs the starter shelf on the very first open, so the ingredient
 * dropdown is never empty. Seeding happens ONCE, ever (tracked in labSettings):
 * once the shelf has been stocked, an emptied shelf stays empty — clearing the
 * inventory before an import is not undone by a page reload.
 */
export const ensureStarterKit = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("rawMaterials").collect();
    const settings = (await ctx.db.query("labSettings").collect())[0] ?? null;
    if (settings?.shelfSeeded) {
      return { inserted: 0, total: existing.length, alreadySeeded: true };
    }

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

    if (settings) {
      await ctx.db.patch(settings._id, { shelfSeeded: true });
    } else {
      await ctx.db.insert("labSettings", { shelfSeeded: true });
    }

    return { inserted, total: existing.length + inserted, alreadySeeded: false };
  },
});

/**
 * Empty the shelf entirely (before importing a fresh price list). Refuses
 * while any formula version still references a material, so records never
 * dangle — the starter shelf is NOT re-installed afterward.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const formulas = await ctx.db.query("formulas").collect();
    if (formulas.length > 0) {
      throw new Error(
        `The shelf still backs ${formulas.length} formula version(s) — delete them first so weighing records never dangle.`,
      );
    }
    const materials = await ctx.db.query("rawMaterials").collect();
    for (const material of materials) {
      await ctx.db.delete(material._id);
    }
    return { removed: materials.length };
  },
});

/** Add a single raw material (the composer and the inventory page both use it). */
export const add = mutation({
  args: {
    name: v.string(),
    category: materialCategoryValidator,
    olfactiveGroup: olfactiveGroupValidator,
    initialGrams: v.number(),
    /** Defaults to initialGrams — pass it when the pack is already open. */
    remainingGrams: v.optional(v.number()),
    price: v.number(),
    vendor: v.optional(v.string()),
    lowStockThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("A material needs a name.");
    if (
      args.initialGrams < 0 ||
      args.price < 0 ||
      (args.remainingGrams !== undefined && args.remainingGrams < 0)
    ) {
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
      remainingGrams: args.remainingGrams ?? args.initialGrams,
      price: args.price,
      vendor: args.vendor?.trim() || undefined,
      lowStockThreshold: args.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
    });
  },
});

/** Edit a material's particulars and stock figures. */
export const update = mutation({
  args: {
    id: v.id("rawMaterials"),
    name: v.string(),
    category: materialCategoryValidator,
    olfactiveGroup: olfactiveGroupValidator,
    initialGrams: v.number(),
    remainingGrams: v.number(),
    price: v.number(),
    vendor: v.optional(v.string()),
    lowStockThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("That material is missing from the shelf.");

    const name = args.name.trim();
    if (!name) throw new Error("A material needs a name.");
    if (
      args.initialGrams < 0 ||
      args.remainingGrams < 0 ||
      args.price < 0 ||
      args.lowStockThreshold < 0
    ) {
      throw new Error("Grams, price and threshold cannot be negative.");
    }

    const dupe = await ctx.db
      .query("rawMaterials")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (dupe && dupe._id !== args.id) {
      throw new Error(`“${name}” is already on the shelf.`);
    }

    await ctx.db.patch(args.id, {
      name,
      category: args.category,
      olfactiveGroup: args.olfactiveGroup,
      initialGrams: args.initialGrams,
      remainingGrams: args.remainingGrams,
      price: args.price,
      vendor: args.vendor?.trim() || undefined,
      lowStockThreshold: args.lowStockThreshold,
    });
    return args.id;
  },
});

/**
 * Mass-update the shelf from a vendor price list (the CSV import): matched by
 * name (case-insensitive) — matched rows are overwritten with the file's
 * figures, unknown names are added as new materials.
 */
export const bulkUpsert = mutation({
  args: {
    rows: v.array(
      v.object({
        name: v.string(),
        category: materialCategoryValidator,
        olfactiveGroup: olfactiveGroupValidator,
        initialGrams: v.number(),
        remainingGrams: v.number(),
        price: v.number(),
        vendor: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("rawMaterials").collect();
    const byName = new Map(existing.map((m) => [m.name.toLowerCase(), m]));

    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const name = row.name.trim();
      if (!name) throw new Error("Every row needs a material name.");
      if (
        row.initialGrams < 0 ||
        row.remainingGrams < 0 ||
        row.price < 0 ||
        !Number.isFinite(row.initialGrams) ||
        !Number.isFinite(row.remainingGrams) ||
        !Number.isFinite(row.price)
      ) {
        throw new Error(`“${name}” has invalid grams or price values.`);
      }

      const found = byName.get(name.toLowerCase());
      if (found) {
        await ctx.db.patch(found._id, {
          name,
          category: row.category,
          olfactiveGroup: row.olfactiveGroup,
          initialGrams: row.initialGrams,
          remainingGrams: row.remainingGrams,
          price: row.price,
          vendor: row.vendor?.trim() || undefined,
        });
        updated += 1;
      } else {
        await ctx.db.insert("rawMaterials", {
          name,
          category: row.category,
          olfactiveGroup: row.olfactiveGroup,
          initialGrams: row.initialGrams,
          remainingGrams: row.remainingGrams,
          price: row.price,
          vendor: row.vendor?.trim() || undefined,
          lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
        });
        inserted += 1;
      }
    }

    return { inserted, updated };
  },
});
