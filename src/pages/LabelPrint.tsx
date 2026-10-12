import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getTemplate,
  pageCount,
  placement,
  sheetCapacity,
  slotPosition,
  type LabelTemplate,
} from "@/lib/label-templates";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Printer } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

/* Fixed ink on fixed paper: labels read the same in either theme and on a
   monochrome thermal head. Never theme tokens inside a label. */
const cap = "text-[8px] font-semibold uppercase tracking-wider text-zinc-500";

/** A row as `labels.list` returns it — plus the resolved version note. */
type QueuedLabel = Doc<"labels"> & { versionDescription?: string };

function num(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Gaps may legitimately be zero (some sheets butt labels together). */
function numGap(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Rebuild the chosen template from the print URL (custom geometry included). */
function templateFromParams(params: URLSearchParams): LabelTemplate {
  const id = params.get("t") ?? "l7160";
  const base = getTemplate(id);
  if (id === "custom") {
    return {
      ...base,
      labelWidthMm: num(params.get("cw"), base.labelWidthMm),
      labelHeightMm: num(params.get("ch"), base.labelHeightMm),
      // Clamped to ≥1 — a rounded-down 0 would turn every grid position NaN.
      cols: Math.max(1, Math.round(num(params.get("cc"), base.cols))),
      rows: Math.max(1, Math.round(num(params.get("cr"), base.rows))),
      sideMm: num(params.get("cs"), base.sideMm),
      topMm: num(params.get("ct"), base.topMm),
      gapXMm: numGap(params.get("gx"), base.gapXMm),
      gapYMm: numGap(params.get("gy"), base.gapYMm),
    };
  }
  if (base.kind === "thermal") {
    // One label per page; the roll is cut to the chosen height.
    const height = num(params.get("h"), base.labelHeightMm);
    return { ...base, labelHeightMm: height, pageHeightMm: height };
  }
  return base;
}

export default function LabelPrint() {
  const [params] = useSearchParams();
  const labels = useQuery(api.labels.list);
  const markPrinted = useMutation(api.labels.markPrinted);

  const template = useMemo(() => templateFromParams(params), [params]);
  const start = Math.round(num(params.get("s"), 1));

  /** The selected ids, in the order they were chosen. */
  const ids = useMemo(
    () => (params.get("ids") ?? "").split(",").filter(Boolean),
    [params],
  );

  const chosen = useMemo(() => {
    if (!labels) return null;
    const byId = new Map(labels.map((label) => [label._id, label]));
    return ids
      .map((id) => byId.get(id as Id<"labels">))
      .filter((label): label is NonNullable<typeof label> => Boolean(label));
  }, [labels, ids]);

  const pages = chosen ? pageCount(template, chosen.length, start) : 0;

  /**
   * Send the run to the printer, then stamp the rows. print() blocks while
   * the dialog is open in every current browser, so the stamp lands when the
   * user has actually seen the dialog (print or cancel — the run was shown).
   */
  function handlePrint() {
    if (!chosen || chosen.length === 0) return;
    const selectedIds = chosen.map((label) => label._id);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        void markPrinted({ ids: selectedIds }).catch(() => {});
      }),
    );
  }

  if (labels === undefined || chosen === null) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-4xl px-5 pb-20 sm:px-8">
          <div className="border-b border-border/70 py-4">
            <Link
              to="/labels"
              className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Label queue
            </Link>
          </div>
          <div className="mt-10 space-y-4">
            <Skeleton className="h-10 w-1/3 rounded-md" />
            <Skeleton className="h-96 w-full rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  const thermal = template.kind === "thermal";
  const perSheet = thermal ? 1 : sheetCapacity(template);

  /** One label's contents — name, version, batch, concentration, amount. */
  function labelBody(label: QueuedLabel, compact: boolean) {
    return (
      <div className="flex h-full w-full flex-col justify-between p-[3mm] text-zinc-900">
        <div className="min-w-0">
          <p
            className={cn(
              "font-display font-semibold leading-tight",
              compact ? "text-[13px]" : "text-[16px]",
            )}
          >
            {label.formulaName}
          </p>
          {label.versionDescription ? (
            <p
              className={cn(
                "mt-[1mm] italic leading-snug text-zinc-600",
                compact ? "line-clamp-1 text-[8.5px]" : "line-clamp-2 text-[10px]",
              )}
            >
              {label.versionDescription}
            </p>
          ) : null}
          <p className={cn(cap, "mt-[1.5mm]")}>
            {label.formulaVersion} · {label.batchNumber}
          </p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="font-mono font-bold leading-none text-zinc-800">
            {label.concentrationPct.toFixed(1)}%
          </span>
          <span
            className={cn(
              "font-mono font-bold leading-none",
              compact ? "text-[14px]" : "text-[17px]",
            )}
          >
            {label.totalAmountGrams.toFixed(2)} g
          </span>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Print rules — only while this view is mounted. The @page size is
          the roll for thermal jobs and A4 for sheets; margin 0 because the
          template already owns every margin (Chrome honours margin: 0). */}
      <style>{`
        @media print {
          @page { size: ${thermal ? `${template.pageWidthMm}mm auto` : "A4"}; margin: 0; }
          html, body {
            background: #fff !important;
            height: auto !important;
            overflow: visible !important;
          }
          body::before, body::after {
            content: none !important;
            display: none !important;
          }
          [style*="position: fixed"] { display: none !important; }
          /* The dashed slot guides exist for the screen only. */
          .label-slot { outline: none !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-5xl px-5 pb-20 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 py-4 print:hidden">
          <Link
            to="/labels"
            className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Label queue
          </Link>
          <div className="flex items-center gap-2">
            <p className="label-caps text-muted-foreground">
              {chosen.length} label{chosen.length === 1 ? "" : "s"} ·{" "}
              {pages} {thermal ? "page" : `sheet${pages === 1 ? "" : "s"}`}
              {!thermal && start > 1 ? ` · from slot ${start}` : ""}
            </p>
            <Button
              className="gap-1.5"
              disabled={chosen.length === 0}
              onClick={handlePrint}
            >
              <Printer className="size-4" />
              Print
            </Button>
          </div>
        </div>

        {chosen.length === 0 ? (
          <div className="paper-sheet mt-10 rounded-lg border border-border/70 px-6 py-14 text-center">
            <p className="font-display text-2xl font-semibold">
              Nothing to print.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground italic">
              No labels were selected — choose them from the queue first.
            </p>
            <Button asChild className="mt-6 gap-1.5">
              <Link to="/labels">
                <ArrowLeft className="size-4" />
                Back to the queue
              </Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto pb-6 print:mt-0 print:overflow-visible print:pb-0">
            {Array.from({ length: pages }, (_, page) => (
              <div
                key={page}
                className={cn(
                  "relative bg-white shadow-xl print:shadow-none",
                  page < pages - 1 && "mb-8 print:mb-0",
                )}
                style={{
                  width: `${template.pageWidthMm}mm`,
                  height: `${thermal ? template.pageHeightMm : template.pageHeightMm}mm`,
                  breakAfter: page < pages - 1 ? "page" : "auto",
                }}
              >
                {chosen
                  .map((label, index) => ({ label, index }))
                  .filter(
                    ({ index }) =>
                      placement(template, index, start).page === page,
                  )
                  .map(({ label, index }) => {
                    const slot = placement(template, index, start).slot;
                    const { xMm, yMm } = slotPosition(template, slot);
                    return (
                      <div
                        key={label._id}
                        className="label-slot absolute outline-1 outline-dashed outline-zinc-300"
                        style={{
                          left: `${xMm}mm`,
                          top: `${yMm}mm`,
                          width: `${template.labelWidthMm}mm`,
                          height: `${template.labelHeightMm}mm`,
                          overflow: "hidden",
                        }}
                      >
                        {labelBody(label, perSheet > 21 || thermal)}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
