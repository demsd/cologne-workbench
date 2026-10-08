import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { formatGrams } from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

/** A signed deviation in grams: "−0.15" / "+0.02". */
function signedGrams(delta: number) {
  const rounded = Math.round(delta * 100) / 100;
  if (rounded === 0) return "—";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(2)}`;
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProductionLog() {
  /** Every weighing record, newest first — immutable rows of the journal. */
  const batches = useQuery(api.batches.list);

  const stats = useMemo(() => {
    const rows = batches ?? [];
    const poured = rows.reduce(
      (sum, batch) => sum + batch.actualTotalWeightGrams,
      0,
    );
    const planned = rows.reduce(
      (sum, batch) => sum + batch.plannedTotalWeightGrams,
      0,
    );
    return {
      count: rows.length,
      poured,
      planned,
      yieldPct: planned > 0 ? (poured / planned) * 100 : null,
    };
  }, [batches]);

  if (batches === undefined) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
          <div className="border-b border-border/70 py-4">
            <Link
              to="/"
              className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              The Ledger
            </Link>
          </div>
          <div className="mt-10 space-y-4">
            <Skeleton className="h-10 w-1/3 rounded-md" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="flex items-center justify-between border-b border-border/70 py-4">
          <Link
            to="/"
            className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            The Ledger
          </Link>
          <p className="label-caps hidden sm:block">
            {stats.count} {stats.count === 1 ? "pour" : "pours"} on record
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
          <p className="label-caps mt-5">Lab Journal</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Production log
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground italic">
            Every pour, recorded exactly as it happened — planned against
            actual, down to the material. Records are never rewritten.
          </p>
        </motion.div>

        {batches.length === 0 ? (
          <div className="paper-sheet mt-8 rounded-lg border border-border/70 px-6 py-14 text-center">
            <p className="font-display text-2xl font-semibold">
              No pours recorded yet.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground italic">
              Weigh a batch from any formula and its record lands here —
              batch number, exact weights, and the version it came from.
            </p>
            <Button asChild className="mt-6">
              <Link to="/">Open the ledger</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* ——— Journal stats ——— */}
            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border/70 py-5 md:grid-cols-4">
              <div>
                <dt className="label-caps">Batches</dt>
                <dd className="mt-1.5 font-display text-3xl font-semibold">
                  {stats.count}
                </dd>
              </div>
              <div>
                <dt className="label-caps">Poured</dt>
                <dd className="mt-1.5 font-mono text-2xl font-bold">
                  {formatGrams(stats.poured)} g
                </dd>
              </div>
              <div>
                <dt className="label-caps">Planned</dt>
                <dd className="mt-1.5 font-mono text-2xl font-bold text-muted-foreground">
                  {formatGrams(stats.planned)} g
                </dd>
              </div>
              <div>
                <dt className="label-caps">Against plan</dt>
                <dd className="mt-1.5 font-mono text-2xl font-bold">
                  {stats.yieldPct === null
                    ? "—"
                    : `${stats.yieldPct.toFixed(1)}%`}
                </dd>
              </div>
            </dl>

            {/* ——— The journal ——— */}
            <div className="mt-6 space-y-3">
              {batches.map((batch) => {
                const delta =
                  batch.actualTotalWeightGrams - batch.plannedTotalWeightGrams;
                const onTarget = Math.abs(delta) < 0.0005;
                return (
                  <Collapsible key={batch._id}>
                    <article className="paper-sheet rounded-lg border border-border/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="rounded border border-border/70 bg-accent/40 px-1.5 py-0.5 font-mono text-xs font-bold">
                            {batch.batchNumber}
                          </span>
                          {batch.formulaName ? (
                            <Link
                              to={`/formulas/${batch.formulaId}`}
                              className="font-display text-xl leading-tight font-semibold transition-colors hover:text-primary"
                            >
                              {batch.formulaName}
                            </Link>
                          ) : (
                            <span className="font-display text-xl leading-tight font-semibold text-muted-foreground">
                              Removed formula
                            </span>
                          )}
                          {batch.formulaVersion ? (
                            <span className="label-caps pt-0.5">
                              {batch.formulaVersion}
                            </span>
                          ) : null}
                        </div>
                        <p className="label-caps text-muted-foreground">
                          {formatDate(batch._creationTime)}
                        </p>
                      </div>

                      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-sm">
                        <span className="text-base font-bold">
                          {formatGrams(batch.actualTotalWeightGrams)} g
                        </span>
                        <span className="text-muted-foreground">
                          of {formatGrams(batch.plannedTotalWeightGrams)} g
                          planned
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px]",
                            onTarget
                              ? "border-brass/50 bg-brass/10 text-brass"
                              : "border-border/70 bg-accent/30 text-muted-foreground",
                          )}
                        >
                          {onTarget ? "on target" : `${signedGrams(delta)} g`}
                        </span>
                      </div>

                      {batch.notes ? (
                        <p className="mt-2 text-sm italic text-muted-foreground">
                          {batch.notes}
                        </p>
                      ) : null}

                      <CollapsibleTrigger className="group mt-3 flex w-full items-center justify-between border-t border-border/60 pt-3 text-left">
                        <span className="label-caps">
                          {batch.items.length} material
                          {batch.items.length === 1 ? "" : "s"} weighed
                        </span>
                        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border/60">
                                <th className="pb-1.5 text-left label-caps">
                                  Material
                                </th>
                                <th className="pb-1.5 text-left label-caps">
                                  Group
                                </th>
                                <th className="pb-1.5 text-right label-caps">
                                  Target g
                                </th>
                                <th className="pb-1.5 text-right label-caps">
                                  Actual g
                                </th>
                                <th className="pb-1.5 text-right label-caps">
                                  Δ
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {batch.items.map((item) => {
                                const itemDelta =
                                  item.actualGrams - item.targetGrams;
                                return (
                                  <tr
                                    key={`${batch._id}-${item.rawMaterialId}`}
                                    className="border-b border-border/40 last:border-0"
                                  >
                                    <td className="py-1.5 font-medium">
                                      {item.materialName}
                                    </td>
                                    <td className="py-1.5 font-mono text-xs text-muted-foreground">
                                      {item.olfactiveGroup}
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-muted-foreground">
                                      {formatGrams(item.targetGrams)}
                                    </td>
                                    <td className="py-1.5 text-right font-mono font-semibold">
                                      {formatGrams(item.actualGrams)}
                                    </td>
                                    <td className="py-1.5 text-right font-mono text-muted-foreground">
                                      {signedGrams(itemDelta)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </CollapsibleContent>
                    </article>
                  </Collapsible>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-muted-foreground italic">
              Deleting a formula removes its records, but poured grams stay
              deducted — the pour physically happened.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
