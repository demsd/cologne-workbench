import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OlfactiveGroup } from "@/convex/schema";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  formatGrams,
  formatMl,
  formatPct,
} from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "convex/react";

type DiffSide = { grams: number; pct: number; group: OlfactiveGroup };

type DiffRow = {
  rawMaterialId: string;
  materialName: string;
  group: OlfactiveGroup;
  a?: DiffSide;
  b?: DiffSide;
};

type ItemLike = {
  rawMaterialId: Id<"rawMaterials">;
  materialName: string;
  olfactiveGroup: OlfactiveGroup;
  amountGrams: number;
  percentage: number;
};

const TOLERANCE_G = 0.0005;
const TOLERANCE_PCT = 0.005;

function sideOf(item: ItemLike): DiffSide {
  return {
    grams: item.amountGrams,
    pct: item.percentage,
    group: item.olfactiveGroup,
  };
}

/**
 * The diff table the PRD asks for: added ingredients, removed ingredients and
 * rebalanced proportions, plus the materials that held steady.
 */
function buildDiff(aItems: ItemLike[], bItems: ItemLike[]) {
  const aMap = new Map(aItems.map((item) => [item.rawMaterialId, item]));
  const bMap = new Map(bItems.map((item) => [item.rawMaterialId, item]));

  const added: DiffRow[] = bItems
    .filter((item) => !aMap.has(item.rawMaterialId))
    .map((item) => ({
      rawMaterialId: item.rawMaterialId,
      materialName: item.materialName,
      group: item.olfactiveGroup,
      b: sideOf(item),
    }));

  const removed: DiffRow[] = aItems
    .filter((item) => !bMap.has(item.rawMaterialId))
    .map((item) => ({
      rawMaterialId: item.rawMaterialId,
      materialName: item.materialName,
      group: item.olfactiveGroup,
      a: sideOf(item),
    }));

  const changed: DiffRow[] = [];
  const unchanged: DiffRow[] = [];
  for (const item of bItems) {
    const previous = aMap.get(item.rawMaterialId);
    if (!previous) continue;
    const differs =
      Math.abs(previous.amountGrams - item.amountGrams) > TOLERANCE_G ||
      Math.abs(previous.percentage - item.percentage) > TOLERANCE_PCT ||
      previous.olfactiveGroup !== item.olfactiveGroup;
    const row: DiffRow = {
      rawMaterialId: item.rawMaterialId,
      materialName: item.materialName,
      group: item.olfactiveGroup,
      a: sideOf(previous),
      b: sideOf(item),
    };
    (differs ? changed : unchanged).push(row);
  }

  return { added, removed, changed, unchanged };
}

/** Signed delta in grams or percent: “+1.25 g”, “−0.40 %”, “±0 g”. */
function signedDelta(value: number, unit: "g" | "%"): string {
  const magnitude =
    unit === "g" ? formatGrams(Math.abs(value)) : formatPct(Math.abs(value));
  if (value > TOLERANCE_G) return `+${magnitude} ${unit}`;
  if (value < -TOLERANCE_G) return `−${magnitude} ${unit}`;
  return `±0 ${unit}`;
}

function deltaClass(value: number): string {
  if (value > TOLERANCE_G) return "text-brass";
  if (value < -TOLERANCE_G) return "text-seal";
  return "text-muted-foreground";
}

function DiffSection({
  title,
  note,
  muted = false,
  children,
}: {
  title: string;
  note?: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "paper-sheet mt-6 overflow-hidden rounded-lg border border-border/70",
        muted && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/70 bg-muted/50 px-5 py-3">
        <h2
          className={cn(
            "font-display font-semibold",
            muted ? "text-xl" : "text-2xl",
          )}
        >
          {title}
        </h2>
        {note ? <span className="label-caps">{note}</span> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const aId = params.get("a");
  const bId = params.get("b");

  const list = useQuery(api.formulas.list);
  const a = useQuery(
    api.formulas.get,
    aId ? { id: aId as Id<"formulas"> } : "skip",
  );
  const b = useQuery(
    api.formulas.get,
    bId ? { id: bId as Id<"formulas"> } : "skip",
  );

  /** On first open, preselect the newest revision and the version it revises. */
  const defaultsTried = useRef(false);
  useEffect(() => {
    if (defaultsTried.current || !list || list.length === 0) return;
    if (aId && bId) {
      defaultsTried.current = true;
      return;
    }
    defaultsTried.current = true;

    const byId = new Map(list.map((f) => [f._id as string, f]));
    const bFormula = (bId ? byId.get(bId) : undefined) ?? list[0];
    const aFormula =
      (aId ? byId.get(aId) : undefined) ??
      (bFormula.parentId ? byId.get(bFormula.parentId) : undefined) ??
      list.find((f) => f._id !== bFormula._id);

    const next = new URLSearchParams();
    next.set("b", bFormula._id);
    if (aFormula && aFormula._id !== bFormula._id) {
      next.set("a", aFormula._id);
    }
    setParams(next, { replace: true });
  }, [list, aId, bId, setParams]);

  const sameFormula = Boolean(a && b && a._id === b._id);
  const diff = useMemo(
    () => (a && b ? buildDiff(a.items, b.items) : null),
    [a, b],
  );

  const nothingToPick = list !== undefined && list.length === 0;
  const sidesLoading =
    (aId !== null && a === undefined) || (bId !== null && b === undefined);

  const picker = (
    label: string,
    value: string | null,
    otherId: string | null,
    onPick: (id: string) => void,
    placeholder: string,
  ) => (
    <div className="space-y-1.5">
      <span className="label-caps">{label}</span>
      <Select value={value ?? ""} onValueChange={onPick}>
        <SelectTrigger className="h-10 w-full">
          <SelectValue
            placeholder={list === undefined ? "Loading…" : placeholder}
          />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {(list ?? []).map((formula) => (
            <SelectItem
              key={formula._id}
              value={formula._id}
              disabled={formula._id === otherId}
            >
              {formula.name} · {formula.versionNumber}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-5 pb-20 sm:px-8">
        <div className="flex items-center justify-between border-b border-border/70 py-4">
          <Link
            to="/"
            className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            The Ledger
          </Link>
          <p className="label-caps hidden sm:block">Version comparison</p>
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
          <p className="label-caps mt-5">Diff between revisions</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Compare Versions
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground italic">
            Pick two versions — everything added, removed or rebalanced between
            them is listed below.
          </p>
        </motion.div>

        {/* ——— Pickers ——— */}
        <div className="mt-8 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
          {picker(
            "Base version (A)",
            aId,
            bId,
            (id) => setParams({ a: id, b: bId ?? "" }),
            "Choose a version…",
          )}
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-1.5"
            disabled={!aId || !bId}
            aria-label="Swap versions"
            onClick={() => setParams({ a: bId ?? "", b: aId ?? "" })}
          >
            <ArrowLeftRight className="size-4" />
          </Button>
          {picker(
            "Revised version (B)",
            bId,
            aId,
            (id) => setParams({ a: aId ?? "", b: id }),
            "Choose a version…",
          )}
        </div>

        {/* ——— States & diff ——— */}
        {nothingToPick ? (
          <div className="paper-sheet mt-8 rounded-lg border border-border/70 px-6 py-14 text-center">
            <p className="font-display text-2xl font-semibold">
              Nothing to compare yet.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground italic">
              Comparison needs at least one filed formula — and becomes useful
              once a second version exists.
            </p>
            <Button asChild className="mt-6">
              <Link to="/">Back to the ledger</Link>
            </Button>
          </div>
        ) : !aId || !bId ? (
          <p className="mt-10 text-center text-sm text-muted-foreground italic">
            Choose two versions above to see the diff.
          </p>
        ) : sidesLoading ? (
          <div className="mt-8 space-y-4">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ) : a === null || b === null ? (
          <div className="paper-sheet mt-8 rounded-lg border border-border/70 px-6 py-14 text-center">
            <p className="font-display text-2xl font-semibold">
              One of these versions has gone missing.
            </p>
            <Button asChild className="mt-6">
              <Link to="/">Back to the ledger</Link>
            </Button>
          </div>
        ) : sameFormula ? (
          <p className="mt-10 text-center text-sm text-muted-foreground italic">
            Those are the same version — pick two different ones.
          </p>
        ) : a && b && diff ? (
          <>
            {/* ——— Context cards ——— */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                { label: "Base version (A)", doc: a },
                { label: "Revised version (B)", doc: b },
              ].map(({ label, doc }) => (
                <div
                  key={label}
                  className="paper-sheet rounded-lg border border-border/70 p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="label-caps">{label}</p>
                    <span className="font-mono text-xs text-muted-foreground">
                      {format(new Date(doc._creationTime), "d MMM yyyy")}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-display text-2xl leading-tight font-semibold">
                      {doc.name}
                    </p>
                    <span
                      className={cn(
                        "stamp",
                        doc.status === "Production"
                          ? "text-seal"
                          : "text-brass",
                      )}
                    >
                      {doc.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                    <span>{doc.versionNumber}</span>
                    <span>{doc.ingredientCount} items</span>
                    <span>{formatGrams(doc.totalGrams)} g</span>
                    <span>{doc.concentrationPct.toFixed(1)} %</span>
                    <span>{formatMl(doc.bottleVolumeMl)} ml</span>
                    <span>{doc.batchWeightGrams.toFixed(2)} g target</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ——— Summary stamps ——— */}
            <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-border/70 py-3">
              <span className="label-caps mr-1">Between them</span>
              <span className="stamp text-brass">
                {diff.added.length} added
              </span>
              <span className="stamp text-seal">
                {diff.removed.length} removed
              </span>
              <span className="stamp text-foreground/70">
                {diff.changed.length} rebalanced
              </span>
              <span className="stamp text-muted-foreground">
                {diff.unchanged.length} unchanged
              </span>
            </div>

            {diff.added.length > 0 ? (
              <DiffSection
                title={`Added in ${b.versionNumber}`}
                note={`${diff.added.length} material${diff.added.length === 1 ? "" : "s"}`}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="label-caps">Material</TableHead>
                      <TableHead className="w-28 label-caps">Group</TableHead>
                      <TableHead className="w-28 text-right label-caps">
                        Grams
                      </TableHead>
                      <TableHead className="w-24 text-right label-caps">
                        %
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.added.map((row) => (
                      <TableRow key={row.rawMaterialId}>
                        <TableCell>{row.materialName}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.group}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatGrams(row.b?.grams ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatPct(row.b?.pct ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DiffSection>
            ) : null}

            {diff.removed.length > 0 ? (
              <DiffSection
                title={`Removed since ${a.versionNumber}`}
                note={`${diff.removed.length} material${diff.removed.length === 1 ? "" : "s"}`}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="label-caps">Material</TableHead>
                      <TableHead className="w-28 label-caps">Group</TableHead>
                      <TableHead className="w-28 text-right label-caps">
                        Grams
                      </TableHead>
                      <TableHead className="w-24 text-right label-caps">
                        %
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.removed.map((row) => (
                      <TableRow key={row.rawMaterialId}>
                        <TableCell>{row.materialName}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.group}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatGrams(row.a?.grams ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatPct(row.a?.pct ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DiffSection>
            ) : null}

            {diff.changed.length > 0 ? (
              <DiffSection
                title="Rebalanced proportions"
                note={`${diff.changed.length} material${diff.changed.length === 1 ? "" : "s"} adjusted`}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="label-caps">Material</TableHead>
                      <TableHead className="w-24 text-right label-caps">
                        {a.versionNumber} g
                      </TableHead>
                      <TableHead className="w-24 text-right label-caps">
                        {b.versionNumber} g
                      </TableHead>
                      <TableHead className="w-24 text-right label-caps">
                        Δ g
                      </TableHead>
                      <TableHead className="hidden w-20 text-right label-caps md:table-cell">
                        {a.versionNumber} %
                      </TableHead>
                      <TableHead className="hidden w-20 text-right label-caps md:table-cell">
                        {b.versionNumber} %
                      </TableHead>
                      <TableHead className="hidden w-24 text-right label-caps md:table-cell">
                        Δ %
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.changed.map((row) => {
                      const deltaGrams = (row.b?.grams ?? 0) - (row.a?.grams ?? 0);
                      const deltaPct = (row.b?.pct ?? 0) - (row.a?.pct ?? 0);
                      return (
                        <TableRow key={row.rawMaterialId}>
                          <TableCell>
                            {row.materialName}
                            {row.a && row.b && row.a.group !== row.b.group ? (
                              <span className="label-caps ml-2">
                                {row.a.group} → {row.b.group}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {formatGrams(row.a?.grams ?? 0)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatGrams(row.b?.grams ?? 0)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-mono text-sm",
                              deltaClass(deltaGrams),
                            )}
                          >
                            {signedDelta(deltaGrams, "g")}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono text-sm text-muted-foreground md:table-cell">
                            {formatPct(row.a?.pct ?? 0)}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono text-sm md:table-cell">
                            {formatPct(row.b?.pct ?? 0)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "hidden text-right font-mono text-sm md:table-cell",
                              deltaClass(deltaPct),
                            )}
                          >
                            {signedDelta(deltaPct, "%")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </DiffSection>
            ) : null}

            {diff.unchanged.length > 0 ? (
              <DiffSection
                title="Unchanged"
                muted
                note={`${diff.unchanged.length} material${diff.unchanged.length === 1 ? "" : "s"} held steady`}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="label-caps">Material</TableHead>
                      <TableHead className="w-28 label-caps">Group</TableHead>
                      <TableHead className="w-28 text-right label-caps">
                        Grams
                      </TableHead>
                      <TableHead className="w-24 text-right label-caps">
                        %
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.unchanged.map((row) => (
                      <TableRow key={row.rawMaterialId}>
                        <TableCell>{row.materialName}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.b?.group ?? row.group}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatGrams(row.b?.grams ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPct(row.b?.pct ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DiffSection>
            ) : null}

            {diff.added.length === 0 &&
            diff.removed.length === 0 &&
            diff.changed.length === 0 ? (
              <div className="paper-sheet mt-6 rounded-lg border border-border/70 px-6 py-12 text-center">
                <p className="font-display text-xl font-semibold">
                  Identical composition.
                </p>
                <p className="mt-2 text-sm text-muted-foreground italic">
                  These two versions weigh the same materials in the same
                  proportions.
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
