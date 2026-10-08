import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OlfactiveGroup } from "@/convex/schema";
import { Button } from "@/components/ui/button";
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
  GROUP_HEADINGS,
  GROUP_ORDER,
  formatGrams,
  formatMl,
  formatPct,
} from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { useQuery } from "convex/react";

/** Ink colours per subsection — ochre, olive, oxblood, faded indigo. */
const GROUP_COLORS: Record<OlfactiveGroup, string> = {
  Top: "var(--chart-1)",
  Middle: "var(--chart-2)",
  Base: "var(--chart-3)",
  Fixative: "var(--chart-4)",
};

export default function FormulaDetail() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery(
    api.formulas.get,
    id ? { id: id as Id<"formulas"> } : "skip",
  );

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
          </header>

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
              Tapputi Lab
            </p>
            <p className="label-caps">Cologne Workbench · Sheet 1 of 1</p>
          </footer>
        </motion.article>
      </div>
    </main>
  );
}
