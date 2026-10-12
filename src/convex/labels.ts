import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * The label queue: every pour files its label here the moment it is created
 * (see batches.create), and the labels page draws entirely from this table.
 * Particulars are snapshotted — a printed label never changes meaning.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("labels").order("desc").collect();
  },
});

/**
 * Queue a label for one pour. Idempotent: one label per batch, ever —
 * clicking twice (or two tabs racing) leaves the original untouched.
 */
export const enqueue = mutation({
  args: { batchId: v.id("productionBatches") },
  handler: async (ctx, { batchId }) => {
    const batch = await ctx.db.get(batchId);
    if (!batch) throw new Error("That pour is missing.");

    const existing = await ctx.db
      .query("labels")
      .withIndex("by_batch", (q) => q.eq("batchId", batchId))
      .unique();
    if (existing) return existing._id;

    const formula = await ctx.db.get(batch.formulaId);
    return await ctx.db.insert("labels", {
      batchId,
      batchNumber: batch.batchNumber,
      formulaName: formula?.name ?? "Removed formula",
      formulaVersion: formula?.versionNumber ?? "—",
      concentrationPct: formula?.concentrationPct ?? 0,
      totalAmountGrams: batch.actualTotalWeightGrams,
      status: "queued",
    });
  },
});

/**
 * Catch up the queue with pours that predate it (or any row that somehow
 * went missing): every batch without a label gains one. Returns how many.
 */
export const enqueueMissing = mutation({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query("productionBatches").collect();
    let added = 0;
    for (const batch of batches) {
      const existing = await ctx.db
        .query("labels")
        .withIndex("by_batch", (q) => q.eq("batchId", batch._id))
        .unique();
      if (existing) continue;
      const formula = await ctx.db.get(batch.formulaId);
      await ctx.db.insert("labels", {
        batchId: batch._id,
        batchNumber: batch.batchNumber,
        formulaName: formula?.name ?? "Removed formula",
        formulaVersion: formula?.versionNumber ?? "—",
        concentrationPct: formula?.concentrationPct ?? 0,
        totalAmountGrams: batch.actualTotalWeightGrams,
        status: "queued",
      });
      added += 1;
    }
    return added;
  },
});

/**
 * Stamp labels as printed once they have been sent to the dialog. Rows
 * already printed are left alone, so re-printing an old label does not
 * rewrite when it first went through the printer.
 */
export const markPrinted = mutation({
  args: { ids: v.array(v.id("labels")) },
  handler: async (ctx, { ids }) => {
    const now = Date.now();
    let stamped = 0;
    for (const id of ids) {
      const label = await ctx.db.get(id);
      if (!label || label.status !== "queued") continue;
      await ctx.db.patch(id, { status: "printed", printedAt: now });
      stamped += 1;
    }
    return stamped;
  },
});

/** Pull a label out of the queue (filed by mistake, batch re-planned). */
export const remove = mutation({
  args: { id: v.id("labels") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
