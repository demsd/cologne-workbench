import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

type Test = ReturnType<typeof convexTest>;

/** Two shelf materials to weigh into formulas. */
async function seedMaterials(t: Test) {
  const alk = await t.mutation(api.rawMaterials.add, {
    name: "Test Alk",
    category: "Alcohol",
    olfactiveGroup: "Alcohol",
    initialGrams: 100,
    price: 10,
  });
  const resin = await t.mutation(api.rawMaterials.add, {
    name: "Test Resin",
    category: "Fixative",
    olfactiveGroup: "Base",
    initialGrams: 100,
    price: 10,
  });
  return { alk, resin };
}

/** A valid create payload; override per test. */
function formulaArgs(alk: Id<"rawMaterials">, resin: Id<"rawMaterials">) {
  return {
    name: "Elixir",
    status: "Experiment" as const,
    versionNumber: "V1",
    versionDescription: "first cut",
    batchWeightGrams: 30,
    concentrationPct: 15,
    bottleVolumeMl: 30,
    minDropGrams: 0.01,
    items: [
      { rawMaterialId: alk, olfactiveGroup: "Alcohol" as const, amountGrams: 10 },
      { rawMaterialId: resin, olfactiveGroup: "Base" as const, amountGrams: 20 },
    ],
  };
}

/** A well-formed id whose document no longer exists (per table, precisely typed). */
async function ghostMaterial(t: Test): Promise<Id<"rawMaterials">> {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert("rawMaterials", {
      name: "Ghost",
      category: "Diluent",
      olfactiveGroup: "Top",
      initialGrams: 1,
      remainingGrams: 1,
      price: 0,
    });
    await ctx.db.delete(id);
    return id;
  });
}

async function ghostFormula(t: Test): Promise<Id<"formulas">> {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert("formulas", {
      name: "Ghost",
      status: "Experiment",
      versionNumber: "V0",
      batchWeightGrams: 1,
      concentrationPct: 1,
      minDropGrams: 0.01,
      ingredientCount: 0,
      totalGrams: 0,
    });
    await ctx.db.delete(id);
    return id;
  });
}

describe("formulas.create — prepareVersion validation (shared with update)", () => {
  it("files a formula with rounded particulars and percentages totalling 100.00", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const id = await t.mutation(api.formulas.create, formulaArgs(alk, resin));

    const created = await t.query(api.formulas.get, { id });
    expect(created).toMatchObject({
      name: "Elixir",
      versionNumber: "V1",
      versionDescription: "first cut",
      batchWeightGrams: 30,
      concentrationPct: 15,
      bottleVolumeMl: 30,
      ingredientCount: 2,
      totalGrams: 30,
      // No parent: `get` derives this — the field itself is absent.
      parentVersion: null,
    });
    expect(created!.items.map((i) => i.amountGrams)).toEqual([10, 20]);
    const pctSum = created!.items.reduce((s, i) => s + i.percentage, 0);
    expect(Math.round(pctSum * 100) / 100).toBe(100);
  });

  const invalid: [string, Partial<ReturnType<typeof formulaArgs>>, string][] = [
    ["empty name", { name: "  " }, "The formula needs a name."],
    ["empty version", { versionNumber: "" }, "The version number cannot be empty."],
    ["zero batch", { batchWeightGrams: 0 }, "Batch weight must be greater than zero grams."],
    ["concentration over 100", { concentrationPct: 101 }, "Concentration must be between 0 and 100 percent."],
    ["zero minimum drop", { minDropGrams: 0 }, "Minimum drop must be greater than zero grams."],
    ["no ingredients", { items: [] }, "Add at least one ingredient before filing."],
  ];
  it.each(invalid)("rejects %s", async (_label, override, message) => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    await expect(
      t.mutation(api.formulas.create, { ...formulaArgs(alk, resin), ...override }),
    ).rejects.toThrowError(message);
  });

  it("rejects an ingredient missing from the shelf", async () => {
    const t = convexTest(schema, modules);
    const { alk } = await seedMaterials(t);
    const gone = await ghostMaterial(t);
    const args = formulaArgs(alk, alk);
    await expect(
      t.mutation(api.formulas.create, {
        ...args,
        items: [{ rawMaterialId: gone, olfactiveGroup: "Top", amountGrams: 5 }],
      }),
    ).rejects.toThrowError("One of the ingredients is missing.");
  });

  it("rejects an amount below the minimum drop", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    await expect(
      t.mutation(api.formulas.create, {
        ...formulaArgs(alk, resin),
        items: [{ rawMaterialId: alk, olfactiveGroup: "Alcohol", amountGrams: 0.001 }],
      }),
    ).rejects.toThrowError("is below the minimum drop of 0.01 g.");
  });

  it("rejects a revision whose parent does not exist", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const gone = await ghostFormula(t);
    await expect(
      t.mutation(api.formulas.create, {
        ...formulaArgs(alk, resin),
        parentId: gone,
      }),
    ).rejects.toThrowError("The version being revised is missing.");
  });
});

describe("formulas.update — in-place revision", () => {
  it("patches particulars and replaces the ingredient rows wholesale", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const id = await t.mutation(api.formulas.create, formulaArgs(alk, resin));
    const before = (await t.query(api.formulas.get, { id }))!.items;

    await t.mutation(api.formulas.update, {
      id,
      name: "Elixir Renamed",
      status: "Production",
      versionNumber: "V1",
      versionDescription: "changed the ratio",
      batchWeightGrams: 37,
      concentrationPct: 20,
      bottleVolumeMl: 50,
      minDropGrams: 0.01,
      items: [
        { rawMaterialId: alk, olfactiveGroup: "Middle", amountGrams: 12 },
        { rawMaterialId: resin, olfactiveGroup: "Base", amountGrams: 25 },
      ],
    });

    const after = (await t.query(api.formulas.get, { id }))!;
    expect(after).toMatchObject({
      name: "Elixir Renamed",
      status: "Production",
      versionDescription: "changed the ratio",
      batchWeightGrams: 37,
      concentrationPct: 20,
      bottleVolumeMl: 50,
      ingredientCount: 2,
      totalGrams: 37,
    });
    // Rows are new documents — nothing from the old composition survives.
    const beforeIds = new Set(before.map((i) => i._id));
    expect(after.items.some((i) => beforeIds.has(i._id))).toBe(false);
    expect(after.items.map((i) => [i.amountGrams, i.olfactiveGroup, i.sortOrder])).toEqual([
      [12, "Middle", 0],
      [25, "Base", 1],
    ]);
    const pctSum = Math.round(after.items.reduce((s, i) => s + i.percentage, 0) * 100) / 100;
    expect(pctSum).toBe(100);
  });

  it("clears optional fields when they are omitted", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const id = await t.mutation(api.formulas.create, formulaArgs(alk, resin));

    await t.mutation(api.formulas.update, {
      id,
      name: "Elixir",
      status: "Experiment",
      versionNumber: "V1",
      batchWeightGrams: 30,
      concentrationPct: 15,
      minDropGrams: 0.01,
      items: [
        { rawMaterialId: alk, olfactiveGroup: "Alcohol", amountGrams: 10 },
        { rawMaterialId: resin, olfactiveGroup: "Base", amountGrams: 20 },
      ],
    });

    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc).not.toHaveProperty("versionDescription");
    expect(doc).not.toHaveProperty("bottleVolumeMl");
  });

  it("keeps the node's lineage and identity", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const parent = await t.mutation(api.formulas.create, formulaArgs(alk, resin));
    const child = await t.mutation(api.formulas.create, {
      ...formulaArgs(alk, resin),
      versionNumber: "V1.1",
      parentId: parent,
    });
    const creationTime = (await t.query(api.formulas.get, { id: child }))!._creationTime;

    await t.mutation(api.formulas.update, {
      id: child,
      name: "Elixir",
      status: "Experiment",
      versionNumber: "V1.1",
      batchWeightGrams: 30,
      concentrationPct: 15,
      minDropGrams: 0.01,
      items: [{ rawMaterialId: alk, olfactiveGroup: "Alcohol", amountGrams: 30 }],
    });

    const after = (await t.query(api.formulas.get, { id: child }))!;
    expect(after.parentId).toBe(parent);
    expect(after._creationTime).toBe(creationTime);
    expect(after.parentVersion).toBe("V1");
  });

  it("refuses a version that is missing", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const gone = await ghostFormula(t);
    await expect(
      t.mutation(api.formulas.update, { ...formulaArgs(alk, resin), id: gone }),
    ).rejects.toThrowError("That version is missing.");
  });

  it("runs the same ingredient validation as create", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const id = await t.mutation(api.formulas.create, formulaArgs(alk, resin));
    await expect(
      t.mutation(api.formulas.update, {
        ...formulaArgs(alk, resin),
        id,
        items: [],
      }),
    ).rejects.toThrowError("Add at least one ingredient before filing.");
  });
});

describe("labels follow the pour and (while unprinted) the formula", () => {
  it("auto-queues a label when a batch is filed", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const formulaId = await t.mutation(api.formulas.create, formulaArgs(alk, resin));
    const { batchNumber } = await t.mutation(api.batches.create, {
      formulaId,
      plannedTotalWeightGrams: 30,
      items: [
        { rawMaterialId: alk, olfactiveGroup: "Alcohol", targetGrams: 10, actualGrams: 10 },
        { rawMaterialId: resin, olfactiveGroup: "Base", targetGrams: 20, actualGrams: 20 },
      ],
    });

    const labels = await t.query(api.labels.list);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      batchNumber,
      formulaName: "Elixir",
      formulaVersion: "V1",
      concentrationPct: 15,
      totalAmountGrams: 30,
      status: "queued",
      versionDescription: "first cut",
    });
  });

  it("is idempotent when enqueued twice for the same batch", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const formulaId = await t.mutation(api.formulas.create, formulaArgs(alk, resin));
    const { batchId } = await t.mutation(api.batches.create, {
      formulaId,
      plannedTotalWeightGrams: 30,
      items: [
        { rawMaterialId: alk, olfactiveGroup: "Alcohol", targetGrams: 10, actualGrams: 10 },
        { rawMaterialId: resin, olfactiveGroup: "Base", targetGrams: 20, actualGrams: 20 },
      ],
    });
    const first = await t.mutation(api.labels.enqueue, { batchId });
    const second = await t.mutation(api.labels.enqueue, { batchId });
    expect(second).toBe(first);
    expect(await t.query(api.labels.list)).toHaveLength(1);
  });

  it("an in-place edit refreshes the queued label but not a printed one", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const formulaId = await t.mutation(api.formulas.create, formulaArgs(alk, resin));
    await t.mutation(api.batches.create, {
      formulaId,
      plannedTotalWeightGrams: 30,
      items: [
        { rawMaterialId: alk, olfactiveGroup: "Alcohol", targetGrams: 10, actualGrams: 10 },
        { rawMaterialId: resin, olfactiveGroup: "Base", targetGrams: 20, actualGrams: 20 },
      ],
    });

    // Edit while queued → the label follows name, version and concentration.
    await t.mutation(api.formulas.update, {
      ...formulaArgs(alk, resin),
      id: formulaId,
      name: "Elixir Mk II",
      concentrationPct: 20,
    });
    let [label] = await t.query(api.labels.list);
    expect(label).toMatchObject({
      formulaName: "Elixir Mk II",
      concentrationPct: 20,
      status: "queued",
    });

    // Printed labels are history: further edits must not touch them.
    await t.mutation(api.labels.markPrinted, { ids: [label._id] });
    await t.mutation(api.formulas.update, {
      ...formulaArgs(alk, resin),
      id: formulaId,
      name: "Elixir Mk III",
      concentrationPct: 30,
    });
    [label] = await t.query(api.labels.list);
    expect(label).toMatchObject({
      formulaName: "Elixir Mk II",
      concentrationPct: 20,
      status: "printed",
    });
  });

  it("removing the formula cascades its batch, label and rows", async () => {
    const t = convexTest(schema, modules);
    const { alk, resin } = await seedMaterials(t);
    const formulaId = await t.mutation(api.formulas.create, formulaArgs(alk, resin));
    await t.mutation(api.batches.create, {
      formulaId,
      plannedTotalWeightGrams: 30,
      items: [
        { rawMaterialId: alk, olfactiveGroup: "Alcohol", targetGrams: 10, actualGrams: 10 },
        { rawMaterialId: resin, olfactiveGroup: "Base", targetGrams: 20, actualGrams: 20 },
      ],
    });

    const result = await t.mutation(api.formulas.remove, { id: formulaId });
    expect(result).toMatchObject({ removedBatches: 1, removedItems: 2 });
    expect(await t.query(api.formulas.get, { id: formulaId })).toBeNull();
    expect(await t.query(api.labels.list)).toHaveLength(0);
    expect(await t.query(api.batches.list)).toHaveLength(0);
  });
});
