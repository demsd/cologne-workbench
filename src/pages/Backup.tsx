import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStarterMaterials } from "@/hooks/use-starter-materials";
import { toInventoryCsv } from "@/lib/csv";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowLeft, Database, Download } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

type Snapshot = {
  rawMaterials: Doc<"rawMaterials">[];
  formulas: Doc<"formulas">[];
  formulaItems: Doc<"formulaItems">[];
  productionBatches: Doc<"productionBatches">[];
  batchItems: Doc<"batchItems">[];
};

/** The JSON envelope: what this file is, when it was taken, how big it is. */
function backupText(snapshot: Snapshot, exportedAt: string): string {
  return JSON.stringify(
    {
      app: "cologne-workbench",
      kind: "workbench-backup",
      schemaVersion: 1,
      exportedAt,
      counts: {
        rawMaterials: snapshot.rawMaterials.length,
        formulas: snapshot.formulas.length,
        formulaItems: snapshot.formulaItems.length,
        productionBatches: snapshot.productionBatches.length,
        batchItems: snapshot.batchItems.length,
      },
      ...snapshot,
    },
    null,
    2,
  );
}

function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Backup() {
  const snapshot = useQuery(api.backup.snapshot);
  const materials = useStarterMaterials();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const counts = useMemo(() => {
    if (!snapshot) return null;
    const total =
      snapshot.rawMaterials.length +
      snapshot.formulas.length +
      snapshot.formulaItems.length +
      snapshot.productionBatches.length +
      snapshot.batchItems.length;
    return {
      materials: snapshot.rawMaterials.length,
      formulas: snapshot.formulas.length,
      formulaItems: snapshot.formulaItems.length,
      batches: snapshot.productionBatches.length,
      batchItems: snapshot.batchItems.length,
      total,
    };
  }, [snapshot]);

  const backLink = (
    <Link
      to="/"
      className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      The Ledger
    </Link>
  );

  if (snapshot === undefined || materials === undefined || !counts) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
          <div className="flex items-center justify-between border-b border-border/70 py-4">
            {backLink}
            <p className="label-caps hidden sm:block">Gathering the ledger…</p>
          </div>
          <div className="mt-10 space-y-4">
            <Skeleton className="h-10 w-1/3 rounded-md" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="flex items-center justify-between border-b border-border/70 py-4">
          {backLink}
          <p className="label-caps hidden sm:block">
            Taken {today} · {counts.total} rows
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mt-10"
        >
          <div className="ornament max-w-52">
            <span />
          </div>
          <p className="label-caps mt-5">Safekeeping</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Backup &amp; export
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground italic">
            The whole ledger in one file — the shelf, every formula version
            with its ingredients, and every pour with its weigh-ins.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border/70 py-5 md:grid-cols-4">
            <div>
              <dt className="label-caps">Materials</dt>
              <dd className="mt-1.5 font-display text-3xl font-semibold">
                {counts.materials}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Formulas</dt>
              <dd className="mt-1.5 font-display text-3xl font-semibold">
                {counts.formulas}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Batches</dt>
              <dd className="mt-1.5 font-display text-3xl font-semibold">
                {counts.batches}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Rows in backup</dt>
              <dd className="mt-1.5 font-mono text-2xl font-bold">
                {counts.total}
              </dd>
            </div>
          </dl>
        </motion.div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Full JSON backup */}
          <section className="paper-sheet flex flex-col rounded-lg border border-border/70 p-5">
            <div className="flex items-baseline justify-between">
              <p className="label-caps">Full backup</p>
              <span className="label-caps text-muted-foreground/70">JSON</span>
            </div>
            <h2 className="mt-2 font-display text-2xl font-semibold">
              One file, everything
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground italic">
              {counts.materials} materials · {counts.formulas} formula
              versions with {counts.formulaItems} ingredient rows ·{" "}
              {counts.batches} batch records with {counts.batchItems} weigh-in
              rows. Human-readable and complete — dated the day you take it.
            </p>
            <Button
              className="mt-5 gap-1.5 self-start"
              onClick={() =>
                download(
                  `cologne-workbench-backup-${today}.json`,
                  backupText(snapshot, new Date().toISOString()),
                  "application/json;charset=utf-8",
                )
              }
            >
              <Download className="size-4" />
              Download full backup
            </Button>
          </section>

          {/* Inventory CSV */}
          <section className="paper-sheet flex flex-col rounded-lg border border-border/70 p-5">
            <div className="flex items-baseline justify-between">
              <p className="label-caps">Inventory</p>
              <span className="label-caps text-muted-foreground/70">CSV</span>
            </div>
            <h2 className="mt-2 font-display text-2xl font-semibold">
              The vendor price list
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground italic">
              {materials.length} materials in the familiar columns — grams,
              prices, vendors, categories and notes. Re-imports straight back
              through Inventory → Import CSV.
            </p>
            <Button
              variant="outline"
              className="mt-5 gap-1.5 self-start"
              onClick={() =>
                download(
                  `cologne-workbench-inventory-${today}.csv`,
                  toInventoryCsv(materials),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="size-4" />
              Download inventory CSV
            </Button>
          </section>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground italic">
          Backups hold data, not identities — sign-in accounts are never in
          the file. The inventory CSV restores through import; the full
          backup is your archive if the ledger ever needs rebuilding.
        </p>
      </div>
    </main>
  );
}
