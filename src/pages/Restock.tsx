import { toRestockCsv } from "@/lib/csv";
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
import { useStarterMaterials } from "@/hooks/use-starter-materials";
import { formatGrams } from "@/lib/formula-math";
import {
  buildRestockRows,
  groupByVendor,
} from "@/lib/restock";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ArrowLeft, Boxes, Download } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

export default function Restock() {
  const materials = useStarterMaterials();

  const shelf = useMemo(() => materials ?? [], [materials]);

  const rows = useMemo(() => buildRestockRows(shelf), [shelf]);
  const groups = useMemo(() => groupByVendor(rows), [rows]);

  const stats = useMemo(() => {
    const shortfall = rows.reduce((sum, row) => sum + row.shortfallGrams, 0);
    const vendors = new Set(
      rows.map((row) => row.vendor).filter(Boolean),
    ).size;
    return { shortfall, vendors };
  }, [rows]);

  function exportCsv() {
    // Vendor-sorted flat rows: the report's grouping survives the spreadsheet.
    const sorted = [...rows].sort((a, b) => {
      const av = a.vendor ?? "";
      const bv = b.vendor ?? "";
      return av.localeCompare(bv) || a.name.localeCompare(b.name);
    });
    const csv = toRestockCsv(sorted);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cologne-workbench-restock.csv";
    anchor.click();
    URL.revokeObjectURL(url);
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

  if (materials === undefined) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
          <div className="flex items-center justify-between border-b border-border/70 py-4">
            {backLink}
            <p className="label-caps hidden sm:block">Checking the shelf…</p>
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
          {backLink}
          <p className="label-caps hidden sm:block">
            {rows.length} to reorder · {stats.vendors} vendor
            {stats.vendors === 1 ? "" : "s"}
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mt-10"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="ornament max-w-52">
                <span />
              </div>
              <p className="label-caps mt-5">Stock room</p>
              <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                Restock report
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground italic">
                What wants ordering, by vendor — fragrance oils below 56 g,
                alcohol and fixatives below 453 g.
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={rows.length === 0}
              onClick={exportCsv}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border/70 py-5 md:grid-cols-4">
            <div>
              <dt className="label-caps">To reorder</dt>
              <dd
                className={cn(
                  "mt-1.5 font-display text-3xl font-semibold",
                  rows.length > 0 && "text-seal",
                )}
              >
                {rows.length}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Vendors</dt>
              <dd className="mt-1.5 font-display text-3xl font-semibold">
                {stats.vendors}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Total shortfall</dt>
              <dd className="mt-1.5 font-mono text-2xl font-bold">
                {formatGrams(stats.shortfall)} g
              </dd>
            </div>
            <div>
              <dt className="label-caps">On the shelf</dt>
              <dd className="mt-1.5 font-display text-3xl font-semibold">
                {shelf.length}
              </dd>
            </div>
          </dl>
        </motion.div>

        {rows.length === 0 ? (
          <div className="paper-sheet mt-8 rounded-lg border border-border/70 px-6 py-14 text-center">
            <div className="ornament mx-auto max-w-40">
              <span />
            </div>
            <p className="mt-6 font-display text-2xl font-semibold">
              Nothing needs reordering.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground italic">
              Every bottle sits above its line — oils at 56 g, alcohol and
              fixatives at 453 g.
            </p>
            <Button asChild className="mt-6 gap-1.5">
              <Link to="/inventory">
                <Boxes className="size-4" />
                Open the inventory
              </Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {groups.map((group) => (
              <section
                key={group.vendor ?? "—no vendor—"}
                className="paper-sheet overflow-hidden rounded-lg border border-border/70"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/70 bg-muted/50 px-5 py-3">
                  <h2 className="font-display text-2xl font-semibold">
                    {group.vendor ?? "No vendor listed"}
                  </h2>
                  <span className="label-caps">
                    {group.rows.length} to reorder ·{" "}
                    {formatGrams(group.shortfallGrams)} g short
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="label-caps">Material</TableHead>
                      <TableHead className="w-32 label-caps">
                        Category
                      </TableHead>
                      <TableHead className="w-32 text-right label-caps">
                        Remaining
                      </TableHead>
                      <TableHead className="w-32 text-right label-caps">
                        Reorder at
                      </TableHead>
                      <TableHead className="w-32 text-right label-caps">
                        Short by
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row) => (
                      <TableRow
                        key={`${group.vendor ?? ""}-${row.name}`}
                        className="hover:bg-transparent"
                      >
                        <TableCell>
                          <span className="font-medium">{row.name}</span>
                          <span className="block text-xs text-muted-foreground italic">
                            {row.olfactiveGroup} · ${row.pricePerGram.toFixed(4)}/g
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.category}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold text-seal">
                          {formatGrams(row.remainingGrams)} g
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {formatGrams(row.reorderAtGrams)} g
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {formatGrams(row.shortfallGrams)} g
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            ))}

            <p className="text-xs text-muted-foreground italic">
              Diluents fall back to their own reorder line, set per material in
              the inventory. Export keeps the vendor grouping as sorted rows.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
