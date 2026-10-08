import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OlfactiveGroup } from "@/convex/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  GROUP_HEADINGS,
  formatGrams,
  formatMl,
  formatPct,
  nextVersionNumber,
  planRescale,
  roundTo,
} from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { ArrowLeft, Check, Scale, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

/** Below this, a pour counts as on target. */
const DEVIATION_TOLERANCE = 0.0005;

type Step = {
  rawMaterialId: Id<"rawMaterials">;
  materialName: string;
  group: OlfactiveGroup;
  /** The design weight from the filed formula version. */
  originalTarget: number;
  /** What the bench directs you to pour now (rescaled if you opted in). */
  currentTarget: number;
  /** What the scale actually read. */
  actual?: number;
};

type RescalePrompt = {
  atIndex: number;
  factor: number;
  preview: { name: string; from: number; to: number }[];
  projectedKeep: number;
  projectedScale: number;
};

export default function Weighing() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery(
    api.formulas.get,
    id ? { id: id as Id<"formulas"> } : "skip",
  );
  const createBatch = useMutation(api.batches.create);
  const createFormula = useMutation(api.formulas.create);
  const navigate = useNavigate();

  const [steps, setSteps] = useState<Step[] | null>(null);
  const seeded = useRef(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [input, setInput] = useState("");
  const [notes, setNotes] = useState("");
  const [prompt, setPrompt] = useState<RescalePrompt | null>(null);
  const [saving, setSaving] = useState<null | "batch" | "version">(null);
  const [savedBatch, setSavedBatch] = useState<{
    batchNumber: string;
    actualTotalWeightGrams: number;
  } | null>(null);

  /** One session per visit: the formula version is copied into local steps. */
  useEffect(() => {
    if (!detail || seeded.current) return;
    seeded.current = true;
    setSteps(
      detail.items.map((item) => ({
        rawMaterialId: item.rawMaterialId,
        materialName: item.materialName,
        group: item.olfactiveGroup,
        originalTarget: item.amountGrams,
        currentTarget: item.amountGrams,
      })),
    );
  }, [detail]);

  // ——— Derived ———
  const currentIndex = steps ? steps.findIndex((s) => s.actual === undefined) : -1;
  const recorded = steps?.filter((s) => s.actual !== undefined) ?? [];
  const actualSoFar = recorded.reduce((sum, s) => sum + (s.actual ?? 0), 0);
  const remainingTotal =
    steps
      ?.filter((s) => s.actual === undefined)
      .reduce((sum, s) => sum + s.currentTarget, 0) ?? 0;
  const designTotal =
    steps?.reduce((sum, s) => sum + s.originalTarget, 0) ?? 0;
  const actualTotal =
    steps?.reduce((sum, s) => sum + (s.actual ?? 0), 0) ?? 0;
  const rescaledUsed =
    steps?.some(
      (s) => Math.abs(s.currentTarget - s.originalTarget) > 1e-6,
    ) ?? false;

  const current = steps && currentIndex >= 0 ? steps[currentIndex] : null;
  const typed = parseFloat(input);
  const typedValid = Number.isFinite(typed) && typed > 0;
  const deviation =
    current && typedValid ? typed - current.currentTarget : null;

  // ——— Actions ———
  function recordCurrent() {
    if (!steps || !current || !typedValid) return;
    const index = currentIndex;
    const actual = roundTo(typed, 4);
    const newSteps = steps.map((s, i) =>
      i === index ? { ...s, actual } : s,
    );
    setSteps(newSteps);
    setInput("");
    setPrompt(null);

    // Proportional rescaling engine (shared, unit-tested in formula-math):
    // does this pour change the scale of the batch? If so, instantly work
    // out what the remaining materials become at the new scale.
    const plan = planRescale(newSteps, index);
    if (plan) {
      setPrompt({
        atIndex: index,
        factor: plan.factor,
        preview: plan.preview,
        projectedKeep: plan.projectedKeep,
        projectedScale: plan.projectedScale,
      });
    }
  }

  function applyRescale() {
    if (!steps || !prompt) return;
    setSteps((prev) =>
      prev
        ? prev.map((s, i) =>
            i > prompt.atIndex && s.actual === undefined
              ? {
                  ...s,
                  currentTarget: roundTo(s.originalTarget * prompt.factor, 4),
                }
              : s,
          )
        : prev,
    );
    toast.success("Remaining materials topped up", {
      description: `Targets rescaled ×${prompt.factor.toFixed(3)} to the new batch size.`,
    });
    setPrompt(null);
  }

  function undoLast() {
    if (!steps) return;
    let last = -1;
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      if (steps[i].actual !== undefined) {
        last = i;
        break;
      }
    }
    if (last < 0) return;
    const value = steps[last].actual;
    setSteps((prev) =>
      prev
        ? prev.map((s, i) => (i === last ? { ...s, actual: undefined } : s))
        : prev,
    );
    setInput(value !== undefined ? String(value) : "");
    setPrompt(null);
  }

  async function saveBatch() {
    if (!detail || !steps || saving) return;
    setSaving("batch");
    try {
      const result = await createBatch({
        formulaId: detail._id,
        plannedTotalWeightGrams: designTotal,
        notes: notes.trim() || undefined,
        items: steps.map((s) => ({
          rawMaterialId: s.rawMaterialId,
          olfactiveGroup: s.group,
          targetGrams: s.currentTarget,
          actualGrams: s.actual ?? 0,
        })),
      });
      setSavedBatch({
        batchNumber: result.batchNumber,
        actualTotalWeightGrams: result.actualTotalWeightGrams,
      });
      toast.success(`Batch ${result.batchNumber} recorded`, {
        description: `${formatGrams(result.actualTotalWeightGrams)} g — filed against ${detail.versionNumber}, immutable.`,
      });
    } catch (error) {
      toast.error("The record was refused", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSaving(null);
    }
  }

  async function fileActuals() {
    if (!detail || !steps || saving) return;
    setSaving("version");
    try {
      const versionNumber = nextVersionNumber(detail.versionNumber);
      const newId = await createFormula({
        name: detail.name,
        status: detail.status,
        versionNumber,
        versionDescription: savedBatch
          ? `Actual proportions weighed at the bench — batch ${savedBatch.batchNumber}.`
          : "Actual proportions weighed at the bench.",
        batchWeightGrams: roundTo(actualTotal, 4),
        concentrationPct: detail.concentrationPct,
        bottleVolumeMl: detail.bottleVolumeMl,
        minDropGrams: detail.minDropGrams,
        parentId: detail._id,
        items: steps.map((s) => ({
          rawMaterialId: s.rawMaterialId,
          olfactiveGroup: s.group,
          amountGrams: s.actual ?? 0,
        })),
      });
      toast.success("Actuals filed as a new version", {
        description: `${detail.name} · ${versionNumber} — the exact proportions you poured.`,
      });
      navigate(`/formulas/${newId}`);
    } catch (error) {
      toast.error("The version was refused", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSaving(null);
    }
  }

  // ——— Shell ———
  const backLink = detail ? (
    <Link
      to={`/formulas/${detail._id}`}
      className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {detail.versionNumber} sheet
    </Link>
  ) : (
    <Link
      to="/"
      className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      The Ledger
    </Link>
  );

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="flex items-center justify-between border-b border-border/70 py-4">
          {backLink}
          <p className="label-caps hidden sm:block">
            {steps
              ? `Scale session · ${recorded.length} of ${steps.length} recorded`
              : "Precision weighing workbench"}
          </p>
        </div>

        {steps === null || !detail ? (
          <div className="mt-10 space-y-4">
            <Skeleton className="h-10 w-1/2 rounded-md" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        ) : !sessionStarted ? (
          /* ——— Intro: about to weigh ——— */
          <div className="mt-12 text-center">
            <div className="ornament mx-auto max-w-sm">
              <span />
            </div>
            <p className="label-caps mt-6">Precision weighing workbench</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-6xl">
              Weigh at the Bench
            </h1>
            <p className="mt-4 font-display text-2xl">
              {detail.name}{" "}
              <span className="font-mono text-lg text-muted-foreground">
                {detail.versionNumber}
              </span>
            </p>
            <dl className="mx-auto mt-8 grid max-w-xl grid-cols-3 divide-x divide-border/70 border-y border-border/70 py-5">
              <div className="px-2">
                <dt className="label-caps">Materials</dt>
                <dd className="mt-1.5 font-display text-3xl font-semibold">
                  {steps.length}
                </dd>
              </div>
              <div className="px-2">
                <dt className="label-caps">Design total</dt>
                <dd className="mt-1.5 font-mono text-2xl font-bold">
                  {formatGrams(designTotal)} g
                </dd>
              </div>
              <div className="px-2">
                <dt className="label-caps">Bottle</dt>
                <dd className="mt-1.5 font-mono text-2xl font-bold">
                  {detail.bottleVolumeMl === undefined
                    ? "—"
                    : `${formatMl(detail.bottleVolumeMl)} ml`}
                </dd>
              </div>
            </dl>
            <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted-foreground italic">
              You&rsquo;ll be walked through each material with its target
              weight. Type what the scale actually reads — if a pour goes off,
              the remaining materials are recalculated to the new scale and you
              decide whether to follow.
            </p>
            <Button
              size="lg"
              className="mt-8 gap-2"
              onClick={() => setSessionStarted(true)}
            >
              <Scale className="size-4" />
              Start weighing
            </Button>
          </div>
        ) : steps && currentIndex === -1 ? (
          /* ——— Finish: summary, record, and/or file actuals ——— */
          <div className="mt-8">
            <div className="paper-sheet rounded-lg border border-border/70 p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="label-caps">Weighing summary</p>
                {savedBatch ? (
                  <span className="stamp text-seal">
                    Batch {savedBatch.batchNumber}
                  </span>
                ) : (
                  <span className="stamp text-brass">Completed</span>
                )}
              </div>
              <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
                {detail.name}{" "}
                <span className="font-mono text-xl text-muted-foreground">
                  {detail.versionNumber}
                </span>
              </h1>

              {savedBatch ? (
                <p className="mt-3 text-sm text-muted-foreground italic">
                  Batch {savedBatch.batchNumber} was recorded at{" "}
                  {format(new Date(), "d MMM yyyy · HH:mm")} with{" "}
                  {formatGrams(savedBatch.actualTotalWeightGrams)} g on the
                  scale — records of the bench are never rewritten.
                </p>
              ) : null}

              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border/70 py-5 md:grid-cols-4">
                <div>
                  <dt className="label-caps">Designed</dt>
                  <dd className="mt-1 font-mono text-lg">
                    {formatGrams(designTotal)} g
                  </dd>
                </div>
                <div>
                  <dt className="label-caps">Weighed</dt>
                  <dd className="mt-1 font-mono text-lg font-bold">
                    {formatGrams(actualTotal)} g
                  </dd>
                </div>
                <div>
                  <dt className="label-caps">Difference</dt>
                  <dd
                    className={cn(
                      "mt-1 font-mono text-lg",
                      Math.abs(actualTotal - designTotal) <= DEVIATION_TOLERANCE
                        ? "text-muted-foreground"
                        : actualTotal > designTotal
                          ? "text-seal"
                          : "text-brass",
                    )}
                  >
                    {Math.abs(actualTotal - designTotal) <=
                    DEVIATION_TOLERANCE
                      ? "±0 g"
                      : `${actualTotal > designTotal ? "+" : "−"}${formatGrams(Math.abs(actualTotal - designTotal))} g`}
                  </dd>
                </div>
                <div>
                  <dt className="label-caps">Materials</dt>
                  <dd className="mt-1 font-mono text-lg">{steps.length}</dd>
                </div>
              </dl>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="label-caps py-2 text-left font-normal">
                        Material
                      </th>
                      <th className="label-caps w-24 py-2 text-right font-normal">
                        Design g
                      </th>
                      {rescaledUsed ? (
                        <th className="label-caps hidden w-24 py-2 text-right font-normal sm:table-cell">
                          Weighed to g
                        </th>
                      ) : null}
                      <th className="label-caps w-24 py-2 text-right font-normal">
                        Actual g
                      </th>
                      <th className="label-caps w-24 py-2 text-right font-normal">
                        Δ g
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((s) => {
                      const delta = (s.actual ?? 0) - s.originalTarget;
                      return (
                        <tr key={s.rawMaterialId} className="border-b border-border/50">
                          <td className="py-2">{s.materialName}</td>
                          <td className="py-2 text-right font-mono text-muted-foreground">
                            {formatGrams(s.originalTarget)}
                          </td>
                          {rescaledUsed ? (
                            <td className="hidden py-2 text-right font-mono text-muted-foreground sm:table-cell">
                              {formatGrams(s.currentTarget)}
                            </td>
                          ) : null}
                          <td className="py-2 text-right font-mono font-bold">
                            {formatGrams(s.actual ?? 0)}
                          </td>
                          <td
                            className={cn(
                              "py-2 text-right font-mono",
                              Math.abs(delta) <= DEVIATION_TOLERANCE
                                ? "text-muted-foreground"
                                : delta > 0
                                  ? "text-seal"
                                  : "text-brass",
                            )}
                          >
                            {Math.abs(delta) <= DEVIATION_TOLERANCE
                              ? "±0"
                              : `${delta > 0 ? "+" : "−"}${formatGrams(Math.abs(delta))}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 space-y-1.5">
                <span className="label-caps">Bench notes</span>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  placeholder="Weather, scale, observations — anything the batch should remember."
                  className="resize-none"
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  onClick={saveBatch}
                  disabled={Boolean(saving) || Boolean(savedBatch)}
                  className="gap-1.5"
                >
                  <Check className="size-4" />
                  {savedBatch
                    ? `Recorded as ${savedBatch.batchNumber}`
                    : saving === "batch"
                      ? "Recording…"
                      : "Save weighing record"}
                </Button>
                <Button
                  variant="outline"
                  onClick={fileActuals}
                  disabled={Boolean(saving)}
                  className="gap-1.5"
                >
                  {saving === "version"
                    ? "Filing…"
                    : `File actuals as ${nextVersionNumber(detail.versionNumber)}`}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSessionStarted(false)}
                  className="gap-1.5"
                >
                  <Undo2 className="size-4" />
                  Back a step
                </Button>
              </div>
            </div>
          </div>
        ) : steps && current ? (
          /* ——— The bench: one material at a time ——— */
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            {/* The scale */}
            <div className="paper-sheet rounded-lg border border-border/70 p-6 text-center">
              <p className="label-caps">
                Step {currentIndex + 1} of {steps.length} ·{" "}
                {GROUP_HEADINGS[current.group]}
              </p>
              <h1 className="mt-3 font-display text-4xl leading-tight font-semibold sm:text-5xl">
                {current.materialName}
              </h1>

              <p className="label-caps mt-8">target on the scale</p>
              <p className="mt-1 font-mono text-6xl font-bold sm:text-7xl">
                {formatGrams(current.currentTarget)}
                <span className="ml-1 text-3xl text-muted-foreground">g</span>
              </p>
              {Math.abs(current.currentTarget - current.originalTarget) >
              1e-6 ? (
                <p className="label-caps mt-2 text-brass">
                  rescaled from {formatGrams(current.originalTarget)} g
                </p>
              ) : null}

              <div className="mx-auto mt-8 max-w-sm space-y-3">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={input}
                  autoFocus
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      recordCurrent();
                    }
                  }}
                  placeholder={formatGrams(current.currentTarget)}
                  aria-label={`Actual grams for ${current.materialName}`}
                  className="h-16 text-center font-mono text-3xl"
                />
                <div className="min-h-6">
                  {deviation !== null ? (
                    <p
                      className={cn(
                        "font-mono text-base",
                        Math.abs(deviation) <= DEVIATION_TOLERANCE
                          ? "text-brass"
                          : deviation > 0
                            ? "text-seal"
                            : "text-brass",
                      )}
                    >
                      {Math.abs(deviation) <= DEVIATION_TOLERANCE
                        ? "on target"
                        : `${deviation > 0 ? "+" : "−"}${formatGrams(Math.abs(deviation))} g ${deviation > 0 ? "over" : "under"} · ${formatPct((Math.abs(deviation) / current.currentTarget) * 100)}%`}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Weigh it out, then type what the scale reads.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setInput(String(current.currentTarget))}
                  >
                    Exact
                  </Button>
                  <Button
                    className="flex-1 gap-1.5"
                    disabled={!typedValid}
                    onClick={recordCurrent}
                  >
                    <Check className="size-4" />
                    Record
                  </Button>
                </div>
              </div>

              {/* ——— Rescaling engine ——— */}
              {prompt ? (
                <div className="mt-8 rounded-lg border-2 border-brass/70 bg-accent/25 px-4 py-4 text-left">
                  <p className="label-caps">
                    Deviation at step {prompt.atIndex + 1}
                  </p>
                  <p className="mt-1 font-display text-xl leading-snug font-semibold">
                    The batch has changed scale — shall the remaining materials
                    follow?
                  </p>
                  <ul className="mt-3 space-y-1">
                    {prompt.preview.map((row) => (
                      <li
                        key={row.name}
                        className="flex items-baseline justify-between gap-3 font-mono text-sm"
                      >
                        <span className="min-w-0 truncate font-body text-sm">
                          {row.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatGrams(row.from)} g →{" "}
                          <span className="font-bold text-foreground">
                            {formatGrams(row.to)} g
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 grid gap-1 font-mono text-xs text-muted-foreground sm:grid-cols-2">
                    <span>
                      keep targets → ≈ {formatGrams(prompt.projectedKeep)} g
                    </span>
                    <span>
                      top up ×{prompt.factor.toFixed(3)} → ≈{" "}
                      {formatGrams(prompt.projectedScale)} g
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="gap-1.5" onClick={applyRescale}>
                      <Check className="size-4" />
                      Top up remaining ×{prompt.factor.toFixed(3)}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPrompt(null)}
                    >
                      Keep original targets
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Progress */}
              <div className="mt-8">
                <div className="flex items-baseline justify-between">
                  <span className="label-caps">
                    {recorded.length} of {steps.length} weighed
                  </span>
                  <span className="font-mono text-sm">
                    {formatGrams(actualSoFar)} g on the scale ·{" "}
                    {formatGrams(remainingTotal)} g to go
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full border border-border/70 bg-muted">
                  <div
                    className="h-full bg-primary/70 transition-[width] duration-500"
                    style={{
                      width: `${steps.length > 0 ? (recorded.length / steps.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* The weigh list */}
            <div className="paper-sheet rounded-lg border border-border/70 p-5">
              <p className="label-caps border-b border-border pb-2">
                The weigh list
              </p>
              <ol className="divide-y divide-border/60">
                {steps.map((s, index) => (
                  <li
                    key={s.rawMaterialId}
                    className={cn(
                      "flex items-baseline gap-3 py-2.5",
                      index === currentIndex &&
                        "-mx-2 rounded-md bg-accent/40 px-2",
                    )}
                  >
                    <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {s.materialName}
                      {Math.abs(s.currentTarget - s.originalTarget) > 1e-6 ? (
                        <span className="label-caps ml-1.5 text-brass">
                          rescaled
                        </span>
                      ) : null}
                    </span>
                    {s.actual !== undefined ? (
                      <>
                        <span
                          className={cn(
                            "font-mono text-sm font-bold",
                            Math.abs(s.actual - s.currentTarget) >
                              DEVIATION_TOLERANCE && "text-seal",
                          )}
                        >
                          {formatGrams(s.actual)}
                        </span>
                        <Check className="size-3.5 shrink-0 text-brass" />
                      </>
                    ) : (
                      <span className="font-mono text-sm text-muted-foreground">
                        {formatGrams(s.currentTarget)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
                <span className="label-caps">Totals</span>
                <span className="font-mono text-sm">
                  {formatGrams(designTotal)} g design ·{" "}
                  <span className="font-bold">
                    {formatGrams(actualTotal)} g weighed
                  </span>
                </span>
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full gap-1.5"
                disabled={recorded.length === 0}
                onClick={undoLast}
              >
                <Undo2 className="size-4" />
                Back a step
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
