import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LABEL_TEMPLATES,
  getTemplate,
  gridExtent,
  gridFits,
  sheetCapacity,
} from "@/lib/label-templates";
import { formatGrams } from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowLeft, Printer, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

/** Parse a positive number from free input; fallback when unusable. */
function num(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Gaps may be zero (some sheets butt labels together). */
function gapNum(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export default function Labels() {
  const labels = useQuery(api.labels.list);
  const batches = useQuery(api.batches.list);
  const enqueueMissing = useMutation(api.labels.enqueueMissing);
  const removeLabel = useMutation(api.labels.remove);
  const navigate = useNavigate();

  // — Print configuration —
  const [templateId, setTemplateId] = useState("l7160");
  const [startInput, setStartInput] = useState("1");
  const [thermalHeight, setThermalHeight] = useState("40");
  // Custom A4 geometry (label w/h, grid, margins, gaps).
  const [custom, setCustom] = useState({
    w: "63.5",
    h: "38.1",
    cols: "3",
    rows: "7",
    side: "7.3",
    top: "15.2",
    gapX: "2.5",
    gapY: "0",
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const template = getTemplate(templateId);
  const capacity = template.kind === "a4" ? sheetCapacity(template) : 0;
  const start = Math.max(1, Math.round(num(startInput, 1)));

  /** The template as configured right now — custom fields parsed & clamped,
      so what is validated is exactly what will be printed. */
  const effectiveTemplate = useMemo(() => {
    if (templateId !== "custom") return template;
    return {
      ...template,
      labelWidthMm: num(custom.w, template.labelWidthMm),
      labelHeightMm: num(custom.h, template.labelHeightMm),
      cols: Math.max(1, Math.round(num(custom.cols, template.cols))),
      rows: Math.max(1, Math.round(num(custom.rows, template.rows))),
      sideMm: num(custom.side, template.sideMm),
      topMm: num(custom.top, template.topMm),
      gapXMm: gapNum(custom.gapX, template.gapXMm),
      gapYMm: gapNum(custom.gapY, template.gapYMm),
    };
  }, [template, templateId, custom]);

  /** Off-sheet grids clip silently at the printer — refuse to send them. */
  const fits =
    effectiveTemplate.kind === "a4" ? gridFits(effectiveTemplate) : true;
  const extent = gridExtent(effectiveTemplate);

  const queued = labels?.filter((l) => l.status === "queued") ?? [];
  const printed = labels?.filter((l) => l.status === "printed") ?? [];

  /** Pours with no label yet — pre-queue days before the queue existed. */
  const missingCount = useMemo(() => {
    if (!batches || !labels) return 0;
    const has = new Set(labels.map((l) => l.batchId as string));
    return batches.filter((b) => !has.has(b._id)).length;
  }, [batches, labels]);

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAll(rows: { _id: string }[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of rows) {
        if (on) next.add(row._id);
        else next.delete(row._id);
      }
      return next;
    });
  }

  async function handleEnqueueMissing() {
    const added = await enqueueMissing();
    toast.success(
      `${added} label${added === 1 ? "" : "s"} queued`,
      { description: "Existing pours caught up with the queue." },
    );
  }

  async function handleRemove(id: Id<"labels">) {
    await removeLabel({ id });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  /** Hand the selection to the print view, geometry included. */
  function handlePrint() {
    if (!fits) return;
    const params = new URLSearchParams();
    params.set("ids", [...selected].join(","));
    params.set("t", templateId);
    if (template.kind === "a4") {
      if (start !== 1) params.set("s", String(start));
      if (templateId === "custom") {
        params.set("cw", String(effectiveTemplate.labelWidthMm));
        params.set("ch", String(effectiveTemplate.labelHeightMm));
        params.set("cc", String(effectiveTemplate.cols));
        params.set("cr", String(effectiveTemplate.rows));
        params.set("cs", String(effectiveTemplate.sideMm));
        params.set("ct", String(effectiveTemplate.topMm));
        params.set("gx", String(effectiveTemplate.gapXMm));
        params.set("gy", String(effectiveTemplate.gapYMm));
      }
    } else {
      params.set("h", String(num(thermalHeight, 40)));
    }
    navigate(`/labels/print?${params.toString()}`);
  }

  if (labels === undefined || batches === undefined) {
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
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  const rows = [...queued, ...printed];

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
            {queued.length} queued · {printed.length} printed
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
          <p className="label-caps mt-5">Print room</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Label queue
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground italic">
            Every pour files its label the moment it lands in the journal —
            name, concentration, total amount. Print on A4 grid sheets or a
            direct thermal roll.
          </p>

          {/* ——— Print configuration ——— */}
          <section className="paper-sheet mt-8 rounded-lg border border-border/70 p-5">
            <p className="label-caps">Print setup</p>
            <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
              <div>
                <p className="label-caps mb-1.5">Template</p>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LABEL_TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {template.kind === "a4" ? (
                <div>
                  <p className="label-caps mb-1.5">
                    Start at label # (partial sheet)
                  </p>
                  <Input
                    type="number"
                    min={1}
                    value={startInput}
                    onChange={(e) => setStartInput(e.target.value)}
                    className="h-9 w-24 font-mono"
                    aria-label="Start at label number"
                  />
                </div>
              ) : (
                <div>
                  <p className="label-caps mb-1.5">Label height (mm)</p>
                  <Input
                    type="number"
                    min={10}
                    max={200}
                    value={thermalHeight}
                    onChange={(e) => setThermalHeight(e.target.value)}
                    className="h-9 w-24 font-mono"
                    aria-label="Thermal label height in millimetres"
                  />
                </div>
              )}

              {template.kind === "a4" ? (
                <p className="label-caps text-muted-foreground">
                  {capacity} per sheet
                  {start > 1 ? ` · begins at slot ${start}` : ""}
                </p>
              ) : (
                <p className="label-caps text-muted-foreground">
                  one label per page · {template.pageWidthMm} mm roll
                </p>
              )}
            </div>

            {templateId === "custom" ? (
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-4 sm:grid-cols-4 lg:grid-cols-8">
                {(
                  [
                    ["Label w (mm)", "w"],
                    ["Label h (mm)", "h"],
                    ["Columns", "cols"],
                    ["Rows", "rows"],
                    ["Side margin", "side"],
                    ["Top margin", "top"],
                    ["Gap X", "gapX"],
                    ["Gap Y", "gapY"],
                  ] as const
                ).map(([caption, key]) => (
                  <div key={key}>
                    <p className="label-caps mb-1.5">{caption}</p>
                    <Input
                      value={custom[key]}
                      onChange={(e) =>
                        setCustom((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="h-8 font-mono"
                      inputMode="decimal"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {!fits ? (
              <p
                role="alert"
                className="mt-3 flex flex-wrap items-baseline gap-x-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                <span className="label-caps">Off-sheet</span>
                <span>
                  {effectiveTemplate.cols} × {effectiveTemplate.rows} at{" "}
                  {effectiveTemplate.labelWidthMm} ×{" "}
                  {effectiveTemplate.labelHeightMm} mm reaches{" "}
                  {extent.widthMm.toFixed(1)} × {extent.heightMm.toFixed(1)}{" "}
                  mm — beyond the 210 × 297 mm sheet. Trim the counts, label
                  size, gaps, or margins to print.
                </span>
              </p>
            ) : null}
          </section>

          {/* ——— Catch-up / actions ——— */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              disabled={selected.size === 0 || !fits}
              onClick={handlePrint}
              className="gap-1.5"
            >
              <Printer className="size-4" />
              Print {selected.size || ""} selected
            </Button>
            {selected.size > 0 ? (
              <Button variant="outline" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            ) : null}
            {missingCount > 0 ? (
              <Button variant="outline" className="gap-1.5" onClick={handleEnqueueMissing}>
                <Tag className="size-3.5" />
                Queue {missingCount} pour{missingCount === 1 ? "" : "s"} without a label
              </Button>
            ) : null}
          </div>

          {/* ——— The queue ——— */}
          {rows.length === 0 ? (
            <div className="paper-sheet mt-6 rounded-lg border border-border/70 px-6 py-14 text-center">
              <p className="font-display text-2xl font-semibold">
                The queue is empty.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground italic">
                Labels file themselves when you record a pour. Older journals
                can be caught up with one click — every batch gains its label.
              </p>
              {missingCount > 0 ? (
                <Button className="mt-6 gap-1.5" onClick={handleEnqueueMissing}>
                  <Tag className="size-4" />
                  Queue {missingCount} existing pour
                  {missingCount === 1 ? "" : "s"}
                </Button>
              ) : (
                <Button asChild className="mt-6">
                  <Link to="/log">Open the production log</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="paper-sheet mt-6 overflow-hidden rounded-lg border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/50">
                    <th className="w-10 px-3 py-2.5">
                      <Checkbox
                        checked={
                          rows.length > 0 && selected.size === rows.length
                        }
                        onCheckedChange={(checked) =>
                          selectAll(rows, checked === true)
                        }
                        aria-label="Select all labels"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left label-caps">Batch</th>
                    <th className="px-3 py-2.5 text-left label-caps">
                      Formula
                    </th>
                    <th className="hidden px-3 py-2.5 text-right label-caps sm:table-cell">
                      Conc.
                    </th>
                    <th className="px-3 py-2.5 text-right label-caps">
                      Amount
                    </th>
                    <th className="px-3 py-2.5 text-left label-caps">State</th>
                    <th className="w-12 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((label) => (
                    <tr
                      key={label._id}
                      className={cn(
                        "border-b border-border/40 last:border-0",
                        label.status === "printed" && "opacity-70",
                      )}
                    >
                      <td className="px-3 py-2.5 align-top">
                        <Checkbox
                          checked={selected.has(label._id)}
                          onCheckedChange={(checked) =>
                            toggle(label._id, checked === true)
                          }
                          aria-label={`Select label for ${label.batchNumber}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 align-top font-mono text-xs font-bold">
                        {label.batchNumber}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="font-medium">{label.formulaName}</span>
                        <span className="ml-2 label-caps">
                          {label.formulaVersion}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 text-right align-top font-mono sm:table-cell">
                        {label.concentrationPct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5 text-right align-top font-mono font-semibold">
                        {formatGrams(label.totalAmountGrams)} g
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px]",
                            label.status === "queued"
                              ? "border-brass/50 bg-brass/10 text-brass"
                              : "border-border/70 bg-accent/30 text-muted-foreground",
                          )}
                        >
                          {label.status === "queued"
                            ? "queued"
                            : `printed${label.printedAt ? ` ${new Date(label.printedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right align-top">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(label._id)}
                          aria-label={`Remove label for ${label.batchNumber}`}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </main>
  );
}
