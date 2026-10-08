import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useStarterMaterials } from "@/hooks/use-starter-materials";
import { formatGrams } from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Filter, LayoutDashboard, LogOut, Plus, ScrollText } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";

const money = (value: number) => `$${value.toFixed(2)}`;

/** Rubber-stamp treatment: Production in seal red, experiments in brass. */
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

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const materials = useStarterMaterials();
  const formulas = useQuery(api.formulas.list);
  const batches = useQuery(api.batches.list);

  const loading =
    materials === undefined || formulas === undefined || batches === undefined;

  const shelf = useMemo(() => materials ?? [], [materials]);

  /** Shelf health: grams, value and the bottles sitting at the reorder line. */
  const shelfStats = useMemo(() => {
    const grams = shelf.reduce((sum, m) => sum + m.remainingGrams, 0);
    const value = shelf.reduce(
      (sum, m) => sum + m.remainingGrams * m.pricePerGram,
      0,
    );
    const low = shelf
      .filter((m) => m.isLow)
      .sort(
        (a, b) =>
          a.remainingGrams / (a.initialGrams || 1) -
          b.remainingGrams / (b.initialGrams || 1),
      );
    return { grams, value, low };
  }, [shelf]);

  /** Formula families: the latest version of every name, newest filed first. */
  const families = useMemo(() => {
    if (!formulas) return [];
    const latest = new Map<string, (typeof formulas)[number]>();
    for (const formula of formulas) {
      const current = latest.get(formula.name);
      if (!current || formula._creationTime > current._creationTime) {
        latest.set(formula.name, formula);
      }
    }
    return [...latest.values()].sort(
      (a, b) => b._creationTime - a._creationTime,
    );
  }, [formulas]);

  const productionCount = families.filter(
    (family) => family.status === "Production",
  ).length;
  const experimentCount = families.length - productionCount;
  const recentPours = batches?.slice(0, 4) ?? [];

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  if (loading) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
          <div className="flex items-center justify-between border-b border-border/70 py-4">
            <p className="label-caps">Cologne Workbench · Workspace</p>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          <div className="mt-10 space-y-4">
            <Skeleton className="h-10 w-1/3 rounded-md" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-56 w-full rounded-lg" />
              <Skeleton className="h-56 w-full rounded-lg" />
              <Skeleton className="h-56 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        {/* ——— Workspace bar ——— */}
        <div className="flex items-center justify-between gap-4 border-b border-border/70 py-4">
          <p className="label-caps">Cologne Workbench · Workspace</p>
          <div className="flex items-center gap-3">
            <p className="label-caps hidden sm:block">
              {user?.name ? user.name : "Signed in"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="gap-1.5"
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>
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
          <p className="label-caps mt-5">Workspace</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground italic">
            The shelf, the ledger and the journal at a glance — everything
            the bench has seen, and what wants your hand next.
          </p>

          {/* ——— Bench numbers ——— */}
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border/70 py-5 md:grid-cols-4">
            <div>
              <dt className="label-caps">Materials</dt>
              <dd className="mt-1.5 font-display text-3xl font-semibold">
                {shelf.length}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Shelf value</dt>
              <dd className="mt-1.5 font-mono text-2xl font-bold">
                {money(shelfStats.value)}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Low stock</dt>
              <dd
                className={cn(
                  "mt-1.5 font-display text-3xl font-semibold",
                  shelfStats.low.length > 0 && "text-seal",
                )}
              >
                {shelfStats.low.length}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Batches poured</dt>
              <dd className="mt-1.5 font-display text-3xl font-semibold">
                {batches?.length ?? 0}
              </dd>
            </div>
          </dl>
        </motion.div>

        {/* ——— The three panels ——— */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Shelf watchlist */}
          <section className="paper-sheet flex flex-col rounded-lg border border-border/70 p-4">
            <div className="flex items-baseline justify-between">
              <p className="label-caps">Shelf watchlist</p>
              <span className="label-caps text-muted-foreground/70">
                {formatGrams(shelfStats.grams)} g shelved
              </span>
            </div>
            {shelfStats.low.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground italic">
                Every bottle sits above its reorder line.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {shelfStats.low.slice(0, 5).map((material) => (
                  <li
                    key={material._id}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="truncate text-sm font-medium">
                      {material.name}
                      <span className="block truncate text-xs font-normal text-muted-foreground italic">
                        {material.vendor ?? "—"}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-sm font-bold text-seal">
                      {formatGrams(material.remainingGrams)} g
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/inventory"
              className="label-caps mt-auto pt-4 text-muted-foreground transition-colors hover:text-foreground"
            >
              Open the inventory →
            </Link>
          </section>

          {/* Recent pours */}
          <section className="paper-sheet flex flex-col rounded-lg border border-border/70 p-4">
            <div className="flex items-baseline justify-between">
              <p className="label-caps">Recent pours</p>
              <span className="label-caps text-muted-foreground/70">
                {batches?.length ?? 0} on record
              </span>
            </div>
            {recentPours.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground italic">
                No pours recorded yet — weigh a batch from any formula and
                it lands here.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {recentPours.map((batch) => (
                  <li
                    key={batch._id}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="truncate text-sm">
                      <span className="font-mono text-xs font-bold">
                        {batch.batchNumber}
                      </span>{" "}
                      {batch.formulaName ?? "Removed formula"}
                      <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                        {batch.formulaVersion ?? ""}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground italic">
                        {format(batch._creationTime, "d MMM yyyy · HH:mm")}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-sm font-bold">
                      {formatGrams(batch.actualTotalWeightGrams)} g
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/log"
              className="label-caps mt-auto pt-4 text-muted-foreground transition-colors hover:text-foreground"
            >
              The production log →
            </Link>
          </section>

          {/* Formula families */}
          <section className="paper-sheet flex flex-col rounded-lg border border-border/70 p-4">
            <div className="flex items-baseline justify-between">
              <p className="label-caps">On the ledger</p>
              <span className="label-caps text-muted-foreground/70">
                {families.length} {families.length === 1 ? "family" : "families"}
              </span>
            </div>
            {families.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground italic">
                The ledger lies empty — file your first formula and it takes
                shape here.
              </p>
            ) : (
              <>
                <div className="mt-3 flex gap-1.5">
                  <span className="rounded-full border border-seal/40 bg-seal/10 px-2 py-0.5 text-xs text-seal">
                    {productionCount} production
                  </span>
                  <span className="rounded-full border border-brass/50 bg-brass/10 px-2 py-0.5 text-xs text-brass">
                    {experimentCount} experiment
                    {experimentCount === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {families.slice(0, 4).map((family) => (
                    <li key={family._id}>
                      <Link
                        to={`/formulas/${family._id}`}
                        className="flex items-baseline justify-between gap-2 transition-colors hover:text-primary"
                      >
                        <span className="truncate text-sm font-medium">
                          {family.name}
                          <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                            {family.versionNumber}
                          </span>
                        </span>
                        <StatusStamp status={family.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Link
              to="/"
              className="label-caps mt-auto pt-4 text-muted-foreground transition-colors hover:text-foreground"
            >
              Open the ledger →
            </Link>
          </section>
        </div>

        {/* ——— Quick actions ——— */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild className="gap-1.5">
            <Link to="/formulas/new">
              <Plus className="size-4" />
              New formula
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link to="/notes">
              <Filter className="size-3.5" />
              Note picker
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link to="/log">
              <ScrollText className="size-3.5" />
              Production log
            </Link>
          </Button>
          <span className="label-caps ml-auto hidden sm:block">
            <LayoutDashboard className="mr-1.5 inline size-3.5 align-text-bottom" />
            Your signed-in workspace
          </span>
        </div>
      </div>
    </main>
  );
}
