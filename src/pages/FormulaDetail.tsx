import { api } from "@/convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Id } from "@/convex/_generated/dataModel";
import type { OlfactiveGroup } from "@/convex/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GRAM_DECIMALS,
  GROUP_HEADINGS,
  GROUP_ORDER,
  formatGrams,
  formatMl,
  formatPct,
  roundTo,
} from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Fragment, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  GitBranch,
  GitCompare,
  PenLine,
  Printer,
  Scale,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";

/** Ink colours per subsection — ochre, olive, oxblood, faded indigo. */
const GROUP_COLORS: Record<OlfactiveGroup, string> = {
  Top: "var(--chart-1)",
  Middle: "var(--chart-2)",
  Base: "var(--chart-3)",
  Fixative: "var(--chart-4)",
  Alcohol: "var(--chart-5)",
};

export default function FormulaDetail() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery(
    api.formulas.get,
    id ? { id: id as Id<"formulas"> } : "skip",
  );
  const lineage = useQuery(
    api.formulas.lineage,
    id ? { id: id as Id<"formulas"> } : "skip",
  );
  const removeFormula = useMutation(api.formulas.remove);
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  /** Scale calculator target in grams — empty means the design total. */
  const [targetInput, setTargetInput] = useState("");

  /** Delete this version; the ledger survives with its lineage re-linked. */
  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      const result = await removeFormula({ id: id as Id<"formulas"> });
      const parts: string[] = [];
      if (result.removedBatches > 0) {
        parts.push(
          `${result.removedBatches} batch record${result.removedBatches === 1 ? "" : "s"} deleted with it`,
        );
      }
      if (result.relinkedChildren > 0) {
        parts.push(
          `${result.relinkedChildren} revision${result.relinkedChildren === 1 ? "" : "s"} re-linked — the lineage survives`,
        );
      }
      if (parts.length === 0) parts.push("The ledger no longer lists it");
      toast.success(`${result.removedName} ${result.removedVersion} deleted`, {
        description: `${parts.join(" · ")}.`,
      });
      navigate("/");
    } catch (error) {
      toast.error("This version cannot be deleted", {
        description:
          error instanceof Error ? error.message : "Try again.",
      });
      setDeleting(false);
    }
  }

  const backLink = (
    <Link
      to="/"
      className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      The Ledger
    </Link>
  );

  if (detail === undefined) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-4xl px-5 pb-20 sm:px-8">
          <div className="flex items-center justify-between border-b border-border/70 py-4">
            {backLink}
            <p className="label-caps hidden sm:block">Fetching the sheet…</p>
          </div>
          <div className="mt-10 space-y-4">
            <Skeleton className="h-10 w-2/3 rounded-md" />
            <Skeleton className="h-5 w-1/3 rounded-md" />
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  if (detail === null) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="paper-sheet max-w-md rounded-lg border border-border/70 px-8 py-12 text-center">
          <div className="ornament mx-auto max-w-40">
            <span />
          </div>
          <p className="mt-6 font-display text-2xl font-semibold">
            No such entry.
          </p>
          <p className="mt-2 text-sm text-muted-foreground italic">
            This page of the ledger is missing — it may have been filed
            elsewhere.
          </p>
          <Button asChild className="mt-6 gap-1.5">
            <Link to="/">
              <ArrowLeft className="size-4" />
              Back to the ledger
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  const sections = GROUP_ORDER.map((group) => {
    const items = detail.items.filter((item) => item.olfactiveGroup === group);
    return {
      group,
      items,
      grams: items.reduce((sum, item) => sum + item.amountGrams, 0),
      pct: items.reduce((sum, item) => sum + item.percentage, 0),
    };
  }).filter((section) => section.items.length > 0);

  /* Scale calculator: the design total is the default target, and any
     positive number retargets the whole batch instantly. One factor,
     applied to every material — percentages never move. */
  const targetRaw = targetInput.trim();
  const scaleTarget =
    targetRaw === "" ? detail.totalGrams : Number(targetRaw);
  const scaleValid =
    detail.totalGrams > 0 && Number.isFinite(scaleTarget) && scaleTarget > 0;
  const scaleFactor = scaleValid ? scaleTarget / detail.totalGrams : 1;

  const particulars: { label: string; value: string }[] = [
    { label: "Version", value: detail.versionNumber },
    { label: "Batch weight", value: `${detail.batchWeightGrams.toFixed(2)} g` },
    {
      label: "Concentration",
      value: `${detail.concentrationPct.toFixed(1)} %`,
    },
    {
      label: "Bottle volume",
      value:
        detail.bottleVolumeMl === undefined
          ? "—"
          : `${formatMl(detail.bottleVolumeMl)} ml`,
    },
    { label: "Minimum drop", value: `${formatGrams(detail.minDropGrams)} g` },
    { label: "Ingredients", value: String(detail.ingredientCount) },
    { label: "Total weighed", value: `${formatGrams(detail.totalGrams)} g` },
    { label: "Material cost", value: `$${detail.cost.totalCost.toFixed(2)}` },
    {
      label: "Cost per gram",
      value: `$${detail.cost.costPerGram.toFixed(4)}/g`,
    },
    {
      label: "Filed",
      value: format(new Date(detail._creationTime), "d MMM yyyy · HH:mm"),
    },
  ];

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-4xl px-5 pb-20 sm:px-8">
        <div className="flex items-center justify-between border-b border-border/70 py-4">
          {backLink}
          <p className="label-caps hidden sm:block">Filed record · Sheet 1 of 1</p>
        </div>

        <motion.article
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          {/* ——— Title block ——— */}
          <header className="mt-10">
            <div className="ornament max-w-52">
              <span />
            </div>
            <p className="label-caps mt-5">
              Formula · {format(new Date(detail._creationTime), "MMMM yyyy")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
              <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-6xl">
                {detail.name}
              </h1>
              <span className="stamp text-foreground/75">
                {detail.versionNumber}
              </span>
              <span
                className={cn(
                  "stamp",
                  detail.status === "Production" ? "text-seal" : "text-brass",
                )}
              >
                {detail.status}
              </span>
            </div>
            {detail.versionDescription ? (
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground italic">
                {detail.versionDescription}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild className="gap-1.5">
                <Link to={`/bench/${detail._id}`}>
                  <Scale className="size-4" />
                  Weigh at the bench
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-1.5">
                <Link to={`/formulas/${detail._id}/edit`}>
                  <PenLine className="size-4" />
                  Edit this version
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-1.5">
                <Link to={`/formulas/${detail._id}/revise`}>
                  <GitBranch className="size-4" />
                  Revise as new version
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-1.5">
                <Link
                  to={`/compare?b=${detail._id}${
                    detail.parentId ? `&a=${detail.parentId}` : ""
                  }`}
                >
                  <GitCompare className="size-4" />
                  {detail.parentVersion
                    ? `Compare with ${detail.parentVersion}`
                    : "Compare versions"}
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-1.5">
                <Link to={`/formulas/${detail._id}/print`}>
                  <Printer className="size-4" />
                  Print sheet
                </Link>
              </Button>
            </div>
          </header>

          {/* ——— Version lineage ——— */}
          {lineage && lineage.length > 0 ? (
            <section className="mt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-1.5">
                <h2 className="label-caps">Version lineage</h2>
                <span className="label-caps">
                  {lineage.length} node{lineage.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
                {lineage.map((node, index) => {
                  const previous = lineage[index - 1];
                  const isLinked =
                    previous !== undefined && node.parentId === previous._id;
                  const isCurrent = node._id === detail._id;
                  return (
                    <div key={node._id} className="flex items-center gap-1">
                      {index > 0 ? (
                        <ChevronRight
                          aria-hidden
                          className={cn(
                            "size-4",
                            isLinked ? "text-foreground/60" : "text-border",
                          )}
                        />
                      ) : null}
                      <Link
                        to={`/formulas/${node._id}`}
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "rounded-md border px-3 py-1.5 transition-colors",
                          isCurrent
                            ? "border-primary/70 bg-accent/50 ring-1 ring-primary/30"
                            : "border-border/70 hover:bg-accent/40",
                        )}
                      >
                        <span className="block font-mono text-sm">
                          {node.versionNumber}
                        </span>
                        <span className="label-caps mt-0.5 block">
                          {format(new Date(node._creationTime), "d MMM yyyy")}
                          {node.status === "Production" ? " · prod" : ""}
                        </span>
                      </Link>
                    </div>
                  );
                })}
                {lineage.length === 1 ? (
                  <span className="ml-1 text-xs text-muted-foreground italic">
                    First version — no revisions yet.
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* ——— Composition at a glance ——— */}
          <div className="paper-sheet mt-8 rounded-lg border border-border/70 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="label-caps">Composition at a glance</p>
              <p className="label-caps">
                {detail.ingredientCount} materials ·{" "}
                {formatGrams(detail.totalGrams)} g
              </p>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full border border-border/70 bg-muted">
              {sections.map((section) => (
                <div
                  key={section.group}
                  className="h-full"
                  title={`${GROUP_HEADINGS[section.group]} — ${formatPct(section.pct)}%`}
                  style={{
                    width: `${section.pct}%`,
                    backgroundColor: GROUP_COLORS[section.group],
                  }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {sections.map((section) => (
                <li
                  key={section.group}
                  className="label-caps flex items-center gap-1.5"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor: GROUP_COLORS[section.group],
                    }}
                  />
                  {GROUP_HEADINGS[section.group]} {formatPct(section.pct)}%
                </li>
              ))}
            </ul>
          </div>

          {/* ——— Particulars ——— */}
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border/70 py-5 md:grid-cols-4">
            {particulars.map((cell) => (
              <div key={cell.label}>
                <dt className="label-caps">{cell.label}</dt>
                <dd className="mt-1 font-mono text-sm">{cell.value}</dd>
              </div>
            ))}
          </dl>

          {/* ——— Scale calculator ———
              PRD: scale total batch outputs (30 g → 60/90/120 or any
              custom target) instantly — pure client maths, the ledger is
              never touched. Percentages never move; only grams do. */}
          <section className="paper-sheet mt-6 rounded-lg border border-border/70 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="label-caps">Scale calculator</p>
              <p className="label-caps text-muted-foreground">
                design {formatGrams(detail.totalGrams)} g
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[2, 3, 4].map((multiple) => (
                <Button
                  key={multiple}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 font-mono"
                  onClick={() =>
                    setTargetInput(String(roundTo(detail.totalGrams * multiple, 2)))
                  }
                >
                  ×{multiple} · {formatGrams(detail.totalGrams * multiple)} g
                </Button>
              ))}
              <span className="label-caps ml-1">custom</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={targetInput}
                placeholder={formatGrams(detail.totalGrams)}
                onChange={(event) => setTargetInput(event.target.value)}
                aria-label="Target total grams"
                className="h-8 w-28 font-mono"
              />
              <span className="label-caps">g total</span>
              {targetInput !== "" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTargetInput("")}
                >
                  Reset
                </Button>
              ) : null}
              {scaleValid ? (
                <span className="rounded-full border border-brass/50 bg-brass/10 px-2 py-0.5 font-mono text-xs font-bold text-brass">
                  ×{scaleFactor.toFixed(3)}
                </span>
              ) : null}
            </div>

            {scaleValid ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="pb-1.5 text-left label-caps">Material</th>
                      <th className="w-32 pb-1.5 text-right label-caps">
                        Design g
                      </th>
                      <th className="w-36 pb-1.5 text-right label-caps">
                        Scaled g
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((section) => (
                      <Fragment key={section.group}>
                        <tr className="border-b border-border/40 bg-muted/40">
                          <td colSpan={3} className="py-1 label-caps">
                            {GROUP_HEADINGS[section.group]}
                          </td>
                        </tr>
                        {section.items.map((item) => (
                          <tr
                            key={item._id}
                            className="border-b border-border/30 last:border-0"
                          >
                            <td className="py-1.5">{item.materialName}</td>
                            <td className="py-1.5 text-right font-mono text-muted-foreground">
                              {formatGrams(item.amountGrams)}
                            </td>
                            <td className="py-1.5 text-right font-mono font-semibold">
                              {formatGrams(
                                roundTo(item.amountGrams * scaleFactor, GRAM_DECIMALS),
                              )}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                    <tr className="border-t-2 border-border/80">
                      <td className="py-1.5 label-caps">
                        {targetInput === "" ? "Design total" : "Scaled total"}
                      </td>
                      <td className="py-1.5 text-right font-mono text-sm text-muted-foreground">
                        {formatGrams(detail.totalGrams)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-sm font-bold">
                        {formatGrams(roundTo(scaleTarget, GRAM_DECIMALS))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm italic text-muted-foreground">
                Enter a target above zero grams to scale the batch.
              </p>
            )}
          </section>

          {/* ——— Grouped composition sheets ——— */}
          {sections.map((section) => (
            <section
              key={section.group}
              className="paper-sheet mt-6 overflow-hidden rounded-lg border border-border/70"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/70 bg-muted/50 px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor: GROUP_COLORS[section.group],
                    }}
                  />
                  <h2 className="font-display text-2xl font-semibold">
                    {GROUP_HEADINGS[section.group]}
                  </h2>
                </div>
                <span className="label-caps">
                  {section.items.length} item
                  {section.items.length === 1 ? "" : "s"} ·{" "}
                  {formatGrams(section.grams)} g · {formatPct(section.pct)}%
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="label-caps">Material</TableHead>
                    <TableHead className="w-28 text-right label-caps">
                      Grams
                    </TableHead>
                    <TableHead className="w-24 text-right label-caps">
                      %
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.items.map((item) => (
                    <TableRow key={item._id} className="hover:bg-transparent">
                      <TableCell>{item.materialName}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatGrams(item.amountGrams)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {formatPct(item.percentage)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-border/80 hover:bg-transparent">
                    <TableCell className="label-caps">Subtotal</TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">
                      {formatGrams(section.grams)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">
                      {formatPct(section.pct)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </section>
          ))}

          {/* ——— Grand totals ——— */}
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6 rounded-lg border-2 border-border/80 px-5 py-4">
            <div>
              <p className="label-caps">Grand total</p>
              <p className="mt-1 font-display text-3xl font-semibold">
                {formatGrams(detail.totalGrams)} g
              </p>
            </div>
            <div className="text-right">
              <p className="label-caps">Composition</p>
              <p className="mt-1 font-mono text-lg">100.00 %</p>
            </div>
            <div className="text-right">
              <p className="label-caps">Target batch</p>
              <p className="mt-1 font-mono text-lg">
                {detail.batchWeightGrams.toFixed(2)} g
              </p>
            </div>
          </div>

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
            <p className="label-caps">
              Filed {format(new Date(detail._creationTime), "d MMMM yyyy")} ·
              Cologne Workbench · Sheet 1 of 1
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Delete version
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {detail.name} — {detail.versionNumber}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    The version and its {detail.ingredientCount} ingredient rows
                    leave the ledger for good.
                    {lineage && lineage.length > 1
                      ? " Revisions descending from it will re-link to the version before it, so the lineage survives."
                      : ""}{" "}
                    Any weighing records made from this version are deleted
                    with it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={deleting}
                    onClick={handleDelete}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {deleting ? "Deleting…" : "Delete for good"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </footer>
        </motion.article>
      </div>
    </main>
  );
}
