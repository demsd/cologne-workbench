import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useStarterMaterials } from "@/hooks/use-starter-materials";
import { GROUP_HEADINGS } from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";

/** The note picker speaks in the classic pyramid — Top, Middle, Base. */
const NOTE_GROUPS = ["Top", "Middle", "Base"] as const;

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
  /** Every fragrance: the latest version per name, with its materials. */
  const fragrances = useQuery(api.formulas.library);

  /** The selected notes are materials picked from the shelf. */
  const [selected, setSelected] = useState<Set<Id<"rawMaterials">>>(
    new Set(),
  );
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [noteSearch, setNoteSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");

  const shelf = useMemo(() => materials ?? [], [materials]);

  /** How many fragrances use each material — the count on every note chip. */
  const fragranceCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const fragrance of fragrances ?? []) {
      for (const id of fragrance.materialIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [fragrances]);

  /** Left panel: Top / Middle / Base notes from the shelf, alphabetical. */
  const noteSections = useMemo(() => {
    const needle = noteSearch.trim().toLowerCase();
    return NOTE_GROUPS.map((group) => ({
      group,
      heading: GROUP_HEADINGS[group],
      items: shelf
        .filter(
          (material) =>
            material.olfactiveGroup === group &&
            (!needle || material.name.toLowerCase().includes(needle)),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [shelf, noteSearch]);

  /** Right panel: the fragrances that contain the selected notes. */
  const results = useMemo(() => {
    const picked = [...selected];
    const needle = nameSearch.trim().toLowerCase();
    const matched = (fragrances ?? [])
      .filter((fragrance) => {
        if (needle && !fragrance.name.toLowerCase().includes(needle)) {
          return false;
        }
        if (picked.length === 0) return true;
        const materialsIn = new Set(fragrance.materialIds);
        return matchMode === "all"
          ? picked.every((id) => materialsIn.has(id))
          : picked.some((id) => materialsIn.has(id));
      })
      .map((fragrance) => {
        const materialsIn = new Set(fragrance.materialIds);
        const hits = picked.filter((id) => materialsIn.has(id));
        const hitNames = hits
          .map((id) => shelf.find((m) => m._id === id)?.name ?? "")
          .filter(Boolean);
        return { ...fragrance, hits: hitNames };
      });

    // Best matches first; alphabetical when nothing is picked yet.
    matched.sort((a, b) =>
      picked.length > 0
        ? b.hits.length - a.hits.length || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
    return matched;
  }, [fragrances, selected, matchMode, nameSearch, shelf]);

  const filtersOn =
    selected.size > 0 || matchMode !== "any" || noteSearch.trim().length > 0;

  function toggleNote(id: Id<"rawMaterials">) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetPicker() {
    setSelected(new Set());
    setMatchMode("any");
    setNoteSearch("");
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
            {fragrances ? ` · ${fragrances.length} fragrances` : ""}
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
            Pick notes on the left — Top, Middle and Base from your shelf —
            and every fragrance built from them appears on the right.
          </p>
        </motion.div>

        {shelf.length === 0 ? (
          <div className="paper-sheet mt-8 rounded-lg border border-border/70 px-6 py-14 text-center">
            <p className="font-display text-2xl font-semibold">
              The shelf is empty.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground italic">
              Import a vendor price list or add materials first — the notes on
              the left are the fragrances you keep.
            </p>
            <Button asChild className="mt-6">
              <Link to="/inventory">Open the inventory</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
            {/* ——— Left: pick your notes ——— */}
            <aside className="paper-sheet rounded-lg border border-border/70 p-4 lg:sticky lg:top-6">
              <div className="flex items-baseline justify-between">
                <p className="label-caps">Pick your notes</p>
                {selected.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="label-caps transition-colors hover:text-foreground"
                  >
                    Clear ({selected.size})
                  </button>
                ) : null}
              </div>

              <Input
                value={noteSearch}
                onChange={(event) => setNoteSearch(event.target.value)}
                placeholder="Find a note…"
                aria-label="Find a note"
                className="mt-2 h-9"
              />

              <div className="mt-4 space-y-5">
                {noteSections.map((section) => (
                  <section key={section.group}>
                    <div className="flex items-baseline justify-between">
                      <p className="label-caps">{section.heading}</p>
                      <span className="label-caps text-muted-foreground/70">
                        {section.items.length}
                      </span>
                    </div>
                    {section.items.length === 0 ? (
                      <p className="mt-1.5 text-xs italic text-muted-foreground">
                        {noteSearch.trim()
                          ? "no note matches the search"
                          : "none on the shelf yet"}
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {section.items.map((material) => (
                          <Chip
                            key={material._id}
                            active={selected.has(material._id)}
                            count={
                              fragrances
                                ? (fragranceCount.get(material._id) ?? 0)
                                : undefined
                            }
                            onClick={() => toggleNote(material._id)}
                          >
                            {material.name}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground italic">
                Fixatives and carriers stay off the board — pick the notes
                that shape the scent.
              </p>

              {selected.size > 1 ? (
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
                  onClick={resetPicker}
                >
                  <X className="size-3.5" />
                  Reset the picker
                </Button>
              ) : null}
            </aside>

            {/* ——— Right: fragrances that contain them ——— */}
            <section>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={nameSearch}
                  onChange={(event) => setNameSearch(event.target.value)}
                  placeholder="Search fragrances…"
                  aria-label="Search fragrances"
                  className="h-10 w-full max-w-xs"
                />
                <span className="label-caps ml-auto">
                  {fragrances
                    ? `${results.length} of ${fragrances.length} fragrances`
                    : "Loading the shelf…"}
                </span>
              </div>

              {fragrances === undefined ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <Skeleton className="h-32 w-full rounded-lg" />
                </div>
              ) : fragrances.length === 0 ? (
                <div className="paper-sheet mt-4 rounded-lg border border-border/70 px-6 py-14 text-center">
                  <p className="font-display text-xl font-semibold">
                    No fragrances filed yet.
                  </p>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground italic">
                    Compose a formula and it will appear here — then this
                    picker shows which of your notes it contains.
                  </p>
                  <Button asChild className="mt-5">
                    <Link to="/formulas/new">Compose a fragrance</Link>
                  </Button>
                </div>
              ) : results.length === 0 ? (
                <div className="paper-sheet mt-4 rounded-lg border border-border/70 px-6 py-14 text-center">
                  <p className="font-display text-xl font-semibold">
                    Nothing matches.
                  </p>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground italic">
                    No fragrance on the shelf contains that combination —
                    loosen a note, or switch the match from
                    &ldquo;All notes&rdquo; to &ldquo;Any note&rdquo;.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-5 gap-1.5"
                    onClick={resetPicker}
                  >
                    <X className="size-4" />
                    Reset the picker
                  </Button>
                </div>
              ) : (
                <>
                  {selected.size === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground italic">
                      Showing every fragrance — pick notes on the left to
                      narrow the list.
                    </p>
                  ) : null}
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {results.map((fragrance) => (
                      <Link
                        key={fragrance._id}
                        to={`/formulas/${fragrance._id}`}
                        className={cn(
                          "paper-sheet group flex flex-col rounded-lg border border-border/70 p-4 transition-colors hover:border-primary/50",
                          selected.size > 0 &&
                            matchMode === "all" &&
                            fragrance.hits.length === selected.size &&
                            "border-primary/40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="font-display text-xl leading-tight font-semibold">
                            {fragrance.name}
                          </h2>
                          <span className="label-caps shrink-0 pt-1">
                            {fragrance.status}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          v{fragrance.versionNumber} ·{" "}
                          {fragrance.ingredientCount} materials
                        </p>

                        <div className="mt-3 flex flex-wrap gap-1">
                          {selected.size === 0 ? (
                            <span className="text-xs text-muted-foreground italic">
                              pick notes to see what it contains
                            </span>
                          ) : fragrance.hits.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">
                              contains none of your notes
                            </span>
                          ) : (
                            <>
                              {fragrance.hits.map((note) => (
                                <span
                                  key={note}
                                  className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary"
                                >
                                  {note}
                                </span>
                              ))}
                              <span className="label-caps self-center pl-1">
                                {fragrance.hits.length} of {selected.size}
                              </span>
                            </>
                          )}
                        </div>

                        <span className="label-caps mt-auto pt-4 text-muted-foreground transition-colors group-hover:text-foreground">
                          Open the sheet →
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
