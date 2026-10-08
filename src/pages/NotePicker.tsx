import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useStarterMaterials } from "@/hooks/use-starter-materials";
import { GROUP_HEADINGS, GROUP_ORDER, formatGrams } from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";

function Chip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/70 bg-background/60 hover:bg-accent/40",
      )}
    >
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            "font-mono text-[10px]",
            active ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export default function NotePicker() {
  const materials = useStarterMaterials();

  /** The classic pyramid is preselected: Top, Middle, Base. */
  const defaultGroups = ["Top", "Middle", "Base"];
  const [groupFilter, setGroupFilter] = useState<Set<string>>(
    () => new Set(defaultGroups),
  );
  const [noteFilter, setNoteFilter] = useState<Set<string>>(new Set());
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [search, setSearch] = useState("");

  const shelf = useMemo(() => materials ?? [], [materials]);

  /** Every note on the shelf with its count — the picker's matrix. */
  const noteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const material of shelf) {
      for (const note of material.notes ?? []) {
        counts.set(note, (counts.get(note) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [shelf]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return shelf.filter((material) => {
      if (groupFilter.size > 0 && !groupFilter.has(material.olfactiveGroup)) {
        return false;
      }
      const materialNotes = material.notes ?? [];
      if (noteFilter.size > 0) {
        const picked = [...noteFilter];
        const has = matchMode === "any"
          ? picked.some((note) => materialNotes.includes(note))
          : picked.every((note) => materialNotes.includes(note));
        if (!has) return false;
      }
      if (needle) {
        const inName = material.name.toLowerCase().includes(needle);
        const inVendor = (material.vendor ?? "")
          .toLowerCase()
          .includes(needle);
        if (!inName && !inVendor) return false;
      }
      return true;
    });
  }, [shelf, groupFilter, noteFilter, matchMode, search]);

  /** One list per selected group — the fragrances that contain each. */
  const sections = useMemo(
    () =>
      GROUP_ORDER.filter((group) => groupFilter.has(group)).map((group) => ({
        group,
        items: filtered.filter((material) => material.olfactiveGroup === group),
      })),
    [filtered, groupFilter],
  );
  const visibleCount = sections.reduce((sum, s) => sum + s.items.length, 0);

  const groupsChanged =
    defaultGroups.some((group) => !groupFilter.has(group)) ||
    [...groupFilter].some((group) => !defaultGroups.includes(group));
  const filtersOn =
    groupsChanged || noteFilter.size > 0 || search.trim().length > 0;

  function toggleGroup(group: string) {
    setGroupFilter((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function toggleNote(note: string) {
    setNoteFilter((prev) => {
      const next = new Set(prev);
      if (next.has(note)) next.delete(note);
      else next.add(note);
      return next;
    });
  }

  function clearFilters() {
    setGroupFilter(new Set(defaultGroups));
    setNoteFilter(new Set());
    setSearch("");
  }

  if (materials === undefined) {
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
          <Link
            to="/"
            className="label-caps inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            The Ledger
          </Link>
          <p className="label-caps hidden sm:block">
            Fragrance library · {shelf.length} materials
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
          <p className="label-caps mt-5">Fragrance library</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Note Picker
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground italic">
            Select combinations of groups and notes — the shelf answers with
            every fragrance that fits. Tag materials with notes in the
            inventory (or your CSV) to widen the matrix.
          </p>
        </motion.div>

        {shelf.length === 0 ? (
          <div className="paper-sheet mt-8 rounded-lg border border-border/70 px-6 py-14 text-center">
            <p className="font-display text-2xl font-semibold">
              The shelf is empty.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground italic">
              Import a vendor price list or add materials first — the picker
              works off the fragrances you keep.
            </p>
            <Button asChild className="mt-6">
              <Link to="/inventory">Open the inventory</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            {/* ——— The matrix ——— */}
            <aside className="paper-sheet rounded-lg border border-border/70 p-4 lg:sticky lg:top-6">
              <div className="flex items-baseline justify-between">
                <p className="label-caps">Groups</p>
                {groupFilter.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setGroupFilter(new Set())}
                    className="label-caps transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {GROUP_ORDER.map((group) => (
                  <Chip
                    key={group}
                    active={groupFilter.has(group)}
                    count={
                      shelf.filter((m) => m.olfactiveGroup === group).length ||
                      undefined
                    }
                    onClick={() => toggleGroup(group)}
                  >
                    {group}
                  </Chip>
                ))}
              </div>

              <div className="mt-5 flex items-baseline justify-between">
                <p className="label-caps">Notes</p>
                {noteFilter.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setNoteFilter(new Set())}
                    className="label-caps transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {noteCounts.length === 0 ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground italic">
                  No notes tagged yet — add facets to a material in the
                  inventory (or a Notes column in your CSV) and they will
                  appear here.
                </p>
              ) : (
                <div className="mt-2 flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
                  {noteCounts.map(([note, count]) => (
                    <Chip
                      key={note}
                      active={noteFilter.has(note)}
                      count={count}
                      onClick={() => toggleNote(note)}
                    >
                      {note}
                    </Chip>
                  ))}
                </div>
              )}

              {noteFilter.size > 1 ? (
                <div className="mt-4">
                  <p className="label-caps">Match</p>
                  <div className="mt-2 flex gap-1.5">
                    <Chip
                      active={matchMode === "any"}
                      onClick={() => setMatchMode("any")}
                    >
                      Any note
                    </Chip>
                    <Chip
                      active={matchMode === "all"}
                      onClick={() => setMatchMode("all")}
                    >
                      All notes
                    </Chip>
                  </div>
                </div>
              ) : null}

              {filtersOn ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-5 w-full gap-1.5"
                  onClick={clearFilters}
                >
                  <X className="size-3.5" />
                  Reset the matrix
                </Button>
              ) : null}
            </aside>

            {/* ——— Results ——— */}
            <section>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search fragrances or vendors…"
                  aria-label="Search fragrances"
                  className="h-10 w-full max-w-xs"
                />
                <span className="label-caps ml-auto">
                  {visibleCount} of {shelf.length} fit
                </span>
              </div>

              {groupFilter.size === 0 ? (
                <div className="paper-sheet mt-4 rounded-lg border border-border/70 px-6 py-14 text-center">
                  <p className="font-display text-xl font-semibold">
                    Pick at least one group.
                  </p>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground italic">
                    Tick Top, Middle and Base — and Fixative or Alcohol when
                    the work calls for them.
                  </p>
                </div>
              ) : visibleCount === 0 ? (
                <div className="paper-sheet mt-4 rounded-lg border border-border/70 px-6 py-14 text-center">
                  <p className="font-display text-xl font-semibold">
                    Nothing matches.
                  </p>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground italic">
                    Loosen a note or two — or switch the match from
                    &ldquo;All notes&rdquo; to &ldquo;Any note&rdquo;.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-5 gap-1.5"
                    onClick={clearFilters}
                  >
                    <X className="size-4" />
                    Reset the matrix
                  </Button>
                </div>
              ) : (
                <div className="mt-6 space-y-8">
                  {sections.map((section) =>
                    section.items.length === 0 ? null : (
                      <section key={section.group}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-1.5">
                          <h2 className="font-display text-2xl font-semibold">
                            {GROUP_HEADINGS[section.group]}
                          </h2>
                          <span className="label-caps">
                            {section.items.length} fragrance
                            {section.items.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {section.items.map((material) => (
                    <article
                      key={material._id}
                      className={cn(
                        "paper-sheet flex flex-col rounded-lg border border-border/70 p-4",
                        material.isLow && "border-destructive/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-display text-xl leading-tight font-semibold">
                          {material.name}
                        </h2>
                        <span className="label-caps shrink-0 pt-1">
                          {material.olfactiveGroup}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground italic">
                        {material.vendor ?? "—"} · {material.category}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-1">
                        {(material.notes ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">
                            no notes tagged
                          </span>
                        ) : (
                          (material.notes ?? []).map((note) => (
                            <span
                              key={note}
                              className={cn(
                                "rounded-full border px-2 py-0.5 font-mono text-[10px]",
                                noteFilter.has(note)
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border/70 bg-accent/30",
                              )}
                            >
                              {note}
                            </span>
                          ))
                        )}
                      </div>

                      <div className="mt-4 flex items-end justify-between gap-2 border-t border-border/60 pt-3">
                        <div>
                          <p
                            className={cn(
                              "font-mono text-sm font-bold",
                              material.isLow && "text-seal",
                            )}
                          >
                            {formatGrams(material.remainingGrams)} g left
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            ${material.pricePerGram.toFixed(4)}/g
                          </p>
                        </div>
                        {material.isLow ? (
                          <span className="stamp text-seal">Low</span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                        </div>
                      </section>
                    ),
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
