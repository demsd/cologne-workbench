import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OlfactiveGroup } from "@/convex/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GROUP_HEADINGS,
  GROUP_ORDER,
  formatGrams,
  formatMl,
  formatPct,
} from "@/lib/formula-math";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams } from "react-router";

/** Ink colours per subsection — ochre, olive, oxblood, faded indigo. */
const GROUP_COLORS: Record<OlfactiveGroup, string> = {
  Top: "var(--chart-1)",
  Middle: "var(--chart-2)",
  Base: "var(--chart-3)",
  Fixative: "var(--chart-4)",
  Alcohol: "var(--chart-5)",
};

/* Fixed ink on fixed paper: the sheet reads the same in either theme and on
   a monochrome printer. Never theme tokens inside the sheet. */
const cap = "text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
const ink = "text-zinc-900";
const inkSoft = "text-zinc-600";
const rule = "border-zinc-300";

export default function FormulaPrint() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery(
    api.formulas.get,
    id ? { id: id as Id<"formulas"> } : "skip",
  );
  const batches = useQuery(api.batches.list);

  const backLink = (
    <Link
      to={id ? `/formulas/${id}` : "/"}
      className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Back to the sheet
    </Link>
  );

  if (detail === undefined) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-4xl px-5 pb-20 sm:px-8">
          <div className="flex items-center justify-between border-b border-border/70 py-4">
            {backLink}
            <p className="label-caps hidden sm:block">Setting the type…</p>
          </div>
          <div className="mt-10 space-y-4">
            <Skeleton className="h-10 w-2/3 rounded-md" />
            <Skeleton className="h-5 w-1/3 rounded-md" />
            <Skeleton className="h-96 w-full rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  if (detail === null) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="paper-sheet max-w-md rounded-lg border border-border/70 px-8 py-12 text-center">
          <p className="font-display text-2xl font-semibold">No such entry.</p>
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

  const pouredFromVersion =
    batches?.filter((batch) => batch.formulaId === detail._id) ?? [];

  const particulars: { label: string; value: string }[] = [
    { label: "Version", value: detail.versionNumber },
    { label: "Status", value: detail.status },
    { label: "Batch weight", value: `${detail.batchWeightGrams.toFixed(2)} g` },
    { label: "Concentration", value: `${detail.concentrationPct.toFixed(1)} %` },
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
    {
      label: "Revises",
      value: detail.parentVersion ?? "— (first version)",
    },
  ];

  return (
    <main className="min-h-screen">
      {/* Print rules — only while this view is mounted. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-4xl px-5 pb-20 sm:px-8">
        <div className="flex items-center justify-between border-b border-border/70 py-4 print:hidden">
          {backLink}
          <Button className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print sheet
          </Button>
        </div>

        {/* ——— The sheet: fixed paper, fixed ink ——— */}
        <article className="mx-auto mt-8 max-w-[210mm] bg-white p-8 text-zinc-900 shadow-xl sm:p-12 print:mt-0 print:shadow-none print:max-w-none">
          <header className={`flex flex-wrap items-baseline justify-between gap-2 border-b-2 ${rule} pb-3`}>
            <p className={cap}>Cologne Workbench · Formula sheet</p>
            <p className={cap}>Sheet 1 of 1</p>
          </header>

          <div className="mt-6">
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              {detail.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <span className={`rounded border ${rule} px-2 py-1 font-mono text-sm font-bold`}>
                {detail.versionNumber}
              </span>
              <span
                className={`rounded border px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${
                  detail.status === "Production"
                    ? "border-red-300 bg-red-50 text-red-800"
                    : "border-amber-300 bg-amber-50 text-amber-800"
                }`}
              >
                {detail.status}
              </span>
              <span className={cap}>
                Filed {format(new Date(detail._creationTime), "d MMMM yyyy")}
              </span>
            </div>
            {detail.versionDescription ? (
              <p className={`mt-4 max-w-2xl text-sm italic ${inkSoft}`}>
                {detail.versionDescription}
              </p>
            ) : null}
          </div>

          {/* Particulars */}
          <dl className={`mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-y ${rule} py-5 sm:grid-cols-4`}>
            {particulars.map((cell) => (
              <div key={cell.label}>
                <dt className={cap}>{cell.label}</dt>
                <dd className={`mt-1 font-mono text-sm ${ink}`}>{cell.value}</dd>
              </div>
            ))}
          </dl>

          {/* Composition bar */}
          <div className="mt-6 print:break-inside-avoid">
            <p className={cap}>Composition</p>
            <div className={`mt-2 flex h-3 overflow-hidden rounded-full border ${rule}`}>
              {sections.map((section) => (
                <div
                  key={section.group}
                  className="h-full"
                  style={{
                    width: `${section.pct}%`,
                    backgroundColor: GROUP_COLORS[section.group],
                  }}
                />
              ))}
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
              {sections.map((section) => (
                <li key={section.group} className={`${cap} flex items-center gap-1.5`}>
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: GROUP_COLORS[section.group] }}
                  />
                  {GROUP_HEADINGS[section.group]} {formatPct(section.pct)}%
                </li>
              ))}
            </ul>
          </div>

          {/* Grouped composition tables */}
          {sections.map((section) => (
            <section
              key={section.group}
              className="mt-6 print:break-inside-avoid"
            >
              <div className={`flex flex-wrap items-baseline justify-between gap-x-3 border-b-2 ${rule} pb-1.5`}>
                <h2 className="font-display text-xl font-semibold">
                  {GROUP_HEADINGS[section.group]}
                </h2>
                <span className={cap}>
                  {section.items.length} item
                  {section.items.length === 1 ? "" : "s"} ·{" "}
                  {formatGrams(section.grams)} g · {formatPct(section.pct)}%
                </span>
              </div>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className={`border-b ${rule}`}>
                    <th className={`pb-1.5 text-left ${cap}`}>Material</th>
                    <th className={`w-32 pb-1.5 text-right ${cap}`}>Grams</th>
                    <th className={`w-24 pb-1.5 text-right ${cap}`}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item._id} className={`border-b border-zinc-200`}>
                      <td className={`py-1.5 ${ink}`}>{item.materialName}</td>
                      <td className={`py-1.5 text-right font-mono ${ink}`}>
                        {formatGrams(item.amountGrams)}
                      </td>
                      <td className={`py-1.5 text-right font-mono ${inkSoft}`}>
                        {formatPct(item.percentage)}
                      </td>
                    </tr>
                  ))}
                  <tr className={`border-b-2 ${rule}`}>
                    <td className={`py-1.5 font-semibold ${cap}`}>Subtotal</td>
                    <td className={`py-1.5 text-right font-mono font-bold ${ink}`}>
                      {formatGrams(section.grams)}
                    </td>
                    <td className={`py-1.5 text-right font-mono font-bold ${ink}`}>
                      {formatPct(section.pct)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          ))}

          {/* Grand totals */}
          <div className={`mt-6 flex flex-wrap items-end justify-between gap-6 border-2 border-zinc-800 px-5 py-4 print:break-inside-avoid`}>
            <div>
              <p className={cap}>Grand total</p>
              <p className="mt-1 font-display text-3xl font-semibold">
                {formatGrams(detail.totalGrams)} g
              </p>
            </div>
            <div className="text-right">
              <p className={cap}>Composition</p>
              <p className={`mt-1 font-mono text-lg ${ink}`}>100.00 %</p>
            </div>
            <div className="text-right">
              <p className={cap}>Target batch</p>
              <p className={`mt-1 font-mono text-lg ${ink}`}>
                {detail.batchWeightGrams.toFixed(2)} g
              </p>
            </div>
          </div>

          {/* Poured from this version */}
          <section className="mt-6 print:break-inside-avoid">
            <div className={`flex flex-wrap items-baseline justify-between border-b ${rule} pb-1.5`}>
              <p className={cap}>Poured from this version</p>
              <p className={cap}>
                {pouredFromVersion.length} batch
                {pouredFromVersion.length === 1 ? "" : "es"}
              </p>
            </div>
            {pouredFromVersion.length === 0 ? (
              <p className={`mt-2 text-sm italic ${inkSoft}`}>
                None yet — this version has not been weighed.
              </p>
            ) : (
              <ul className={`mt-2 divide-y divide-zinc-200 text-sm`}>
                {pouredFromVersion.map((batch) => (
                  <li
                    key={batch._id}
                    className={`flex flex-wrap items-baseline justify-between gap-2 py-1.5`}
                  >
                    <span className={ink}>
                      <span className="font-mono font-bold">
                        {batch.batchNumber}
                      </span>
                      <span className={`ml-2 ${inkSoft}`}>
                        {format(batch._creationTime, "d MMM yyyy · HH:mm")}
                      </span>
                    </span>
                    <span className={`font-mono ${ink}`}>
                      {formatGrams(batch.actualTotalWeightGrams)} g actual
                      <span className={`ml-3 ${inkSoft}`}>
                        of {formatGrams(batch.plannedTotalWeightGrams)} g planned
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Signature block — the paper ritual */}
          <section className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 print:break-inside-avoid">
            <div>
              <div className="h-8 border-b border-zinc-400" />
              <p className={`mt-1.5 ${cap}`}>Weighed by</p>
            </div>
            <div>
              <div className="h-8 border-b border-zinc-400" />
              <p className={`mt-1.5 ${cap}`}>Date</p>
            </div>
            <div>
              <div className="h-8 border-b border-zinc-400" />
              <p className={`mt-1.5 ${cap}`}>Checked by</p>
            </div>
            <div>
              <div className="h-8 border-b border-zinc-400" />
              <p className={`mt-1.5 ${cap}`}>Signature</p>
            </div>
          </section>

          <footer className={`mt-8 flex flex-wrap items-baseline justify-between gap-2 border-t ${rule} pt-3`}>
            <p className={cap}>
              Printed {format(new Date(), "d MMMM yyyy, HH:mm")} · Cologne
              Workbench · Bench No. 1
            </p>
            <p className={`${cap} normal-case tracking-normal`}>
              Costs quoted at shelf prices on the day of printing.
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}
