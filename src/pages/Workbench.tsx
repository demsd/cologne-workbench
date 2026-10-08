import { api } from "@/convex/_generated/api";
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
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { GitCompare, Plus } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";

/** Rubber-stamp treatment: Production is stamped in seal red, experiments in brass. */
function StatusStamp({ status }: { status: "Experiment" | "Production" }) {
  return (
    <span
      className={cn(
        "stamp",
        status === "Production" ? "text-seal" : "text-brass",
      )}
    >
      {status}
    </span>
  );
}

export default function Workbench() {
  const formulas = useQuery(api.formulas.list);
  const materials = useStarterMaterials();
  const navigate = useNavigate();

  const loading = formulas === undefined;

  /** Dossier numbers count up from the oldest entry: CW-001, CW-002, … */
  const ledger = useMemo(() => {
    if (!formulas) return [];
    const byAge = [...formulas].sort((a, b) => a._creationTime - b._creationTime);
    const number = new Map(
      byAge.map((f, index) => [
        f._creationTime,
        `CW-${String(index + 1).padStart(3, "0")}`,
      ]),
    );
    return formulas.map((f) => ({
      ...f,
      dossier: number.get(f._creationTime) ?? "CW-000",
    }));
  }, [formulas]);

  const productionCount =
    formulas?.filter((f) => f.status === "Production").length ?? 0;

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        {/* ——— Masthead ——— */}
        <header>
          <div className="flex items-center justify-between gap-4 border-b border-border/70 py-4">
            <p className="label-caps">Cologne Workbench · Bench No. 1</p>
            <p className="label-caps hidden sm:block">
              Single-perfumer edition · Version 1
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mt-8 text-center sm:mt-12"
          >
            <div className="ornament mx-auto max-w-sm">
              <span />
            </div>
            <p className="label-caps mt-6">Formulation &amp; Weighing Ledger</p>
            <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight sm:text-7xl">
              Cologne Workbench
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground italic sm:text-lg">
              A perfumer&rsquo;s ledger for formulas, versions and weighings —
              kept in one hand, in grams, at this bench.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/formulas/new">
                  <Plus className="size-4" />
                  New formula
                </Link>
              </Button>
            </div>

            <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-3 divide-x divide-border/70 border-y border-border/70 py-5">
              <div className="px-2">
                <dt className="label-caps">Formulas filed</dt>
                <dd className="mt-1.5 font-display text-3xl font-semibold">
                  {loading ? "—" : formulas?.length ?? 0}
                </dd>
              </div>
              <div className="px-2">
                <dt className="label-caps">On the shelf</dt>
                <dd className="mt-1.5 font-display text-3xl font-semibold">
                  {materials === undefined ? "—" : materials.length}
                </dd>
              </div>
              <div className="px-2">
                <dt className="label-caps">In production</dt>
                <dd className="mt-1.5 font-display text-3xl font-semibold">
                  {loading ? "—" : productionCount}
                </dd>
              </div>
            </dl>
          </motion.div>
        </header>

        {/* ——— The ledger: what you see when you open the app ——— */}
        <motion.section
          id="ledger"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="mt-10 sm:mt-14"
        >
          <div className="rule-double flex items-end justify-between gap-4 pb-3">
            <div>
              <p className="label-caps">Register</p>
              <h2 className="mt-1 font-display text-3xl font-semibold">
                Formula Ledger
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {ledger.length >= 2 ? (
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to="/compare">
                    <GitCompare className="size-3.5" />
                    Compare versions
                  </Link>
                </Button>
              ) : null}
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/formulas/new">
                  <Plus className="size-3.5" />
                  New formula
                </Link>
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 space-y-3" aria-label="Loading the ledger">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : ledger.length === 0 ? (
            <div className="paper-sheet mt-6 rounded-lg border border-border/70 px-6 py-14 text-center">
              <div className="ornament mx-auto max-w-40">
                <span />
              </div>
              <p className="mt-6 font-display text-2xl font-semibold">
                The ledger lies empty.
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground italic">
                Every perfume begins as a single line — name it, set the batch,
                and weigh in your first materials.
              </p>
              <Button asChild className="mt-6 gap-1.5">
                <Link to="/formulas/new">
                  <Plus className="size-4" />
                  File your first formula
                </Link>
              </Button>
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-lg border border-border/70 bg-card/70 paper-sheet">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-24 label-caps">No.</TableHead>
                    <TableHead className="label-caps">Formula</TableHead>
                    <TableHead className="hidden w-20 label-caps sm:table-cell">
                      Ver.
                    </TableHead>
                    <TableHead className="w-36 label-caps">Status</TableHead>
                    <TableHead className="hidden w-28 text-right label-caps md:table-cell">
                      Batch (g)
                    </TableHead>
                    <TableHead className="hidden w-24 text-right label-caps md:table-cell">
                      Conc. (%)
                    </TableHead>
                    <TableHead className="hidden w-24 text-right label-caps sm:table-cell">
                      Items
                    </TableHead>
                    <TableHead className="hidden w-28 text-right label-caps lg:table-cell">
                      Filed
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((f) => (
                    <TableRow
                      key={f._id}
                      className="cursor-pointer transition-colors hover:bg-accent/40"
                      onClick={() => navigate(`/formulas/${f._id}`)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {f.dossier}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/formulas/${f._id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-display text-lg leading-tight font-medium underline-offset-4 hover:underline"
                        >
                          {f.name}
                        </Link>
                        {f.versionDescription ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground italic">
                            {f.versionDescription}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden font-mono text-sm sm:table-cell">
                        {f.versionNumber}
                      </TableCell>
                      <TableCell>
                        <StatusStamp status={f.status} />
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-sm md:table-cell">
                        {f.batchWeightGrams.toFixed(2)}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-sm md:table-cell">
                        {f.concentrationPct.toFixed(1)}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-sm sm:table-cell">
                        {f.ingredientCount}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs text-muted-foreground lg:table-cell">
                        {format(new Date(f._creationTime), "d MMM yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </motion.section>

        <footer className="mt-16 border-t border-border/70 pt-5">
          <p className="label-caps text-center">
            Cologne Workbench · Version one — formulas only, kept by hand
          </p>
        </footer>
      </div>
    </main>
  );
}
