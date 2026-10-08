import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OlfactiveGroup } from "@/convex/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStarterMaterials } from "@/hooks/use-starter-materials";
import {
  GROUP_HEADINGS,
  GROUP_ORDER,
  computePercentages,
  formatGrams,
  formatPct,
  sortGroups,
} from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import { ArrowLeft, Check, Plus, X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

type DraftItem = {
  key: number;
  rawMaterialId: Id<"rawMaterials">;
  materialName: string;
  group: OlfactiveGroup;
  grams: string;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="label-caps">{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs text-muted-foreground italic">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export default function FormulaNew() {
  const materials = useStarterMaterials();
  const createFormula = useMutation(api.formulas.create);
  const navigate = useNavigate();
  const nextKey = useRef(1);

  // — Particulars —
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"Experiment" | "Production">(
    "Experiment",
  );
  const [versionNumber, setVersionNumber] = useState("V1");
  const [versionDescription, setVersionDescription] = useState("");

  // — Measurements —
  const [batchWeight, setBatchWeight] = useState("28.35");
  const [concentration, setConcentration] = useState("15");
  const [bottleVolume, setBottleVolume] = useState("30");
  const [minDrop, setMinDrop] = useState("0.01");

  // — Composition —
  const [items, setItems] = useState<DraftItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [composerGroup, setComposerGroup] = useState<OlfactiveGroup>("Top");
  const [composerGrams, setComposerGrams] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);

  // — Save state —
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const minDropNum = parseFloat(minDrop) || 0;

  /** Live preview: same numbers `formulas.create` will write. */
  const amounts = useMemo(
    () => items.map((item) => parseFloat(item.grams) || 0),
    [items],
  );
  const percentages = useMemo(() => computePercentages(amounts), [amounts]);
  const totalGrams = useMemo(
    () => amounts.reduce((sum, g) => sum + g, 0),
    [amounts],
  );

  const rows = items.map((item, index) => ({
    ...item,
    pct: percentages[index],
  }));
  const presentGroups = sortGroups(items.map((item) => item.group));
  const targetGrams = parseFloat(batchWeight) || 0;
  const deltaGrams = totalGrams - targetGrams;

  function handleMaterialChange(id: string) {
    setSelectedId(id);
    const material = materials?.find((m) => m._id === id);
    if (material) setComposerGroup(material.olfactiveGroup);
    setComposerError(null);
  }

  function addItem() {
    if (!selectedId) {
      setComposerError("Choose a material from the shelf first.");
      return;
    }
    const grams = parseFloat(composerGrams);
    if (!Number.isFinite(grams) || grams <= 0) {
      setComposerError("Enter the amount in grams.");
      return;
    }
    if (grams < minDropNum) {
      setComposerError(`That is below the minimum drop of ${minDrop} g.`);
      return;
    }
    const material = materials?.find((m) => m._id === selectedId);
    if (!material) {
      setComposerError("That material is no longer on the shelf.");
      return;
    }
    if (items.some((item) => item.rawMaterialId === material._id)) {
      setComposerError(
        `“${material.name}” is already weighed in — edit its grams below instead.`,
      );
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        key: nextKey.current++,
        rawMaterialId: material._id,
        materialName: material.name,
        group: composerGroup,
        grams: composerGrams,
      },
    ]);
    setSelectedId(undefined);
    setComposerGrams("");
    setComposerError(null);
    setErrors([]);
  }

  function updateGroup(key: number, group: OlfactiveGroup) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, group } : item)),
    );
  }

  function updateGrams(key: number, grams: string) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, grams } : item)),
    );
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!name.trim()) errs.push("The formula needs a name.");
    if (!versionNumber.trim()) errs.push("The version number cannot be empty.");

    const batch = parseFloat(batchWeight);
    if (!Number.isFinite(batch) || batch <= 0) {
      errs.push("Batch weight must be greater than zero grams.");
    }
    const conc = parseFloat(concentration);
    if (!Number.isFinite(conc) || conc <= 0 || conc > 100) {
      errs.push("Concentration must be between 0 and 100 percent.");
    }
    if (bottleVolume.trim()) {
      const bottle = parseFloat(bottleVolume);
      if (!Number.isFinite(bottle) || bottle <= 0) {
        errs.push(
          "Bottle volume must be greater than zero millilitres — or leave it blank.",
        );
      }
    }
    if (!Number.isFinite(minDropNum) || minDropNum <= 0) {
      errs.push("Minimum drop must be greater than zero grams.");
    }

    if (items.length === 0) {
      errs.push("Weigh in at least one ingredient before filing.");
    }
    for (const item of items) {
      const grams = parseFloat(item.grams);
      if (!Number.isFinite(grams) || grams <= 0) {
        errs.push(`“${item.materialName}” needs an amount above zero grams.`);
      } else if (grams < minDropNum) {
        errs.push(
          `“${item.materialName}” is below the minimum drop of ${minDrop} g.`,
        );
      }
    }
    return errs;
  }

  async function handleSave() {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);
    try {
      const id = await createFormula({
        name: name.trim(),
        status,
        versionNumber: versionNumber.trim(),
        versionDescription: versionDescription.trim() || undefined,
        batchWeightGrams: parseFloat(batchWeight),
        concentrationPct: parseFloat(concentration),
        bottleVolumeMl: bottleVolume.trim()
          ? parseFloat(bottleVolume)
          : undefined,
        minDropGrams: minDropNum,
        items: items.map((item) => ({
          rawMaterialId: item.rawMaterialId,
          olfactiveGroup: item.group,
          amountGrams: parseFloat(item.grams),
        })),
      });
      toast.success("Filed in the ledger", {
        description: `${name} · ${versionNumber} · ${items.length} ingredient${items.length === 1 ? "" : "s"}`,
      });
      navigate(`/formulas/${id}`);
    } catch (error) {
      setErrors([
        error instanceof Error
          ? error.message
          : "The ledger refused the entry. Try again.",
      ]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  const shelf = materials ?? [];

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
          <p className="label-caps hidden sm:block">New entry · Draft</p>
        </div>

        <header className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="ornament max-w-52">
              <span />
            </div>
            <p className="label-caps mt-5">Formulation sheet</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              New Formula
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground italic">
              Name the work, set the targets, then weigh each material into the
              ledger. Percentages settle themselves to exactly 100.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/")}
              className="gap-1.5"
            >
              <X className="size-4" />
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5"
            >
              <Check className="size-4" />
              {saving ? "Filing…" : "File this formula"}
            </Button>
          </div>
        </header>

        {errors.length > 0 ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border-2 border-destructive/50 bg-destructive/5 px-4 py-3"
          >
            <p className="label-caps text-destructive">
              The entry was refused
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          {/* ——— Left: particulars & measurements ——— */}
          <div className="space-y-6">
            <Card className="paper-sheet rounded-lg border-border/70">
              <CardHeader className="pb-4">
                <p className="label-caps">Section I</p>
                <CardTitle className="font-display text-2xl font-semibold">
                  Particulars
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Formula name">
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. No. 7 — Rain on Slate"
                    className="h-10"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Status">
                    <Select
                      value={status}
                      onValueChange={(value) =>
                        setStatus(value as "Experiment" | "Production")
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Experiment">Experiment</SelectItem>
                        <SelectItem value="Production">Production</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Version number" hint="e.g. V1">
                    <Input
                      value={versionNumber}
                      onChange={(event) => setVersionNumber(event.target.value)}
                      placeholder="V1"
                      className="h-10 font-mono"
                    />
                  </Field>
                </div>
                <Field
                  label="Version description"
                  hint="What this revision is about — it prints on the sheet."
                >
                  <Textarea
                    value={versionDescription}
                    onChange={(event) =>
                      setVersionDescription(event.target.value)
                    }
                    rows={2}
                    placeholder="First composition — rose forward, softer drydown."
                    className="resize-none"
                  />
                </Field>
              </CardContent>
            </Card>

            <Card className="paper-sheet rounded-lg border-border/70">
              <CardHeader className="pb-4">
                <p className="label-caps">Section II</p>
                <CardTitle className="font-display text-2xl font-semibold">
                  Measurements
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Batch weight (g)" hint="Target total of the batch">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={batchWeight}
                    onChange={(event) => setBatchWeight(event.target.value)}
                    className="h-10 text-right font-mono"
                  />
                </Field>
                <Field
                  label="Concentration (%)"
                  hint="e.g. 15 for a 15% concentrate"
                >
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={concentration}
                    onChange={(event) => setConcentration(event.target.value)}
                    className="h-10 text-right font-mono"
                  />
                </Field>
                <Field label="Bottle volume (ml)" hint="e.g. 30">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={bottleVolume}
                    onChange={(event) => setBottleVolume(event.target.value)}
                    className="h-10 text-right font-mono"
                  />
                </Field>
                <Field
                  label="Minimum drop (g)"
                  hint="No ingredient may weigh less"
                >
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={minDrop}
                    onChange={(event) => setMinDrop(event.target.value)}
                    className="h-10 text-right font-mono"
                  />
                </Field>
              </CardContent>
            </Card>
          </div>

          {/* ——— Right: composition ——— */}
          <Card className="paper-sheet rounded-lg border-border/70 lg:sticky lg:top-6">
            <CardHeader className="pb-4">
              <p className="label-caps">Section III</p>
              <CardTitle className="font-display text-2xl font-semibold">
                Composition
              </CardTitle>
              <CardDescription className="italic">
                Choose a material, confirm its group and weight, then add it to
                the sheet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Composer */}
              <div className="rounded-md border border-border/70 bg-background/50 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_6.5rem_auto]">
                  <div className="space-y-1.5">
                    <span className="label-caps">Material</span>
                    <Select
                      value={selectedId}
                      onValueChange={handleMaterialChange}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue
                          placeholder={
                            materials === undefined
                              ? "Stocking the shelf…"
                              : "Choose from the shelf…"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {sortGroups(
                          shelf.map((material) => material.olfactiveGroup),
                        ).map((group) => {
                          const inGroup = shelf.filter(
                            (material) => material.olfactiveGroup === group,
                          );
                          if (inGroup.length === 0) return null;
                          return (
                            <SelectGroup key={group}>
                              <SelectLabel className="label-caps">
                                {GROUP_HEADINGS[group]}
                              </SelectLabel>
                              {inGroup.map((material) => (
                                <SelectItem
                                  key={material._id}
                                  value={material._id}
                                >
                                  {material.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <span className="label-caps">Group</span>
                    <Select
                      value={composerGroup}
                      onValueChange={(value) =>
                        setComposerGroup(value as OlfactiveGroup)
                      }
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GROUP_ORDER.map((group) => (
                          <SelectItem key={group} value={group}>
                            {group}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <span className="label-caps">Grams</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={composerGrams}
                      onChange={(event) => {
                        setComposerGrams(event.target.value);
                        setComposerError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addItem();
                        }
                      }}
                      placeholder="0.00"
                      aria-label="Amount in grams"
                      className="h-10 text-right font-mono"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={addItem}
                    className="h-10 gap-1.5 self-end"
                  >
                    <Plus className="size-4" />
                    Add
                  </Button>
                </div>
                {composerError ? (
                  <p className="mt-2 text-xs text-destructive">
                    {composerError}
                  </p>
                ) : null}
              </div>

              {/* The grouped ledger */}
              {items.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/80 px-4 py-10 text-center">
                  <p className="font-display text-lg font-medium">
                    Nothing weighed in yet.
                  </p>
                  <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground italic">
                    Materials will be listed here by Name, Group, Grams and
                    Percentage — sorted Top, Middle, Base, Fixative.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {presentGroups.map((group) => {
                    const groupRows = rows.filter(
                      (row) => row.group === group,
                    );
                    const groupGrams = groupRows.reduce(
                      (sum, row) => sum + (parseFloat(row.grams) || 0),
                      0,
                    );
                    const groupPct = groupRows.reduce(
                      (sum, row) => sum + row.pct,
                      0,
                    );
                    return (
                      <section key={group}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-1.5">
                          <h3 className="font-display text-xl font-semibold">
                            {GROUP_HEADINGS[group]}
                          </h3>
                          <span className="label-caps">
                            {groupRows.length} item
                            {groupRows.length === 1 ? "" : "s"} ·{" "}
                            {formatGrams(groupGrams)} g · {formatPct(groupPct)}
                            %
                          </span>
                        </div>
                        <ul className="divide-y divide-border/60">
                          {groupRows.map((row) => (
                            <li
                              key={row.key}
                              className="flex flex-wrap items-center gap-2 py-2"
                            >
                              <span className="min-w-0 flex-1 basis-40 text-sm">
                                {row.materialName}
                              </span>
                              <Select
                                value={row.group}
                                onValueChange={(value) =>
                                  updateGroup(
                                    row.key,
                                    value as OlfactiveGroup,
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 w-28 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {GROUP_ORDER.map((groupOption) => (
                                    <SelectItem
                                      key={groupOption}
                                      value={groupOption}
                                    >
                                      {groupOption}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.grams}
                                onChange={(event) =>
                                  updateGrams(row.key, event.target.value)
                                }
                                aria-label={`${row.materialName} in grams`}
                                className="h-8 w-24 text-right font-mono text-sm"
                              />
                              <span className="w-16 text-right font-mono text-sm text-muted-foreground">
                                {formatPct(row.pct)}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeItem(row.key)}
                                aria-label={`Remove ${row.materialName}`}
                                className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                              >
                                <X className="size-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex-col gap-4 border-t border-border/70 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="label-caps">Total weighed</p>
                <p className="mt-1 font-display text-2xl font-semibold">
                  {formatGrams(totalGrams)} g
                  <span className="ml-2 font-body text-sm font-normal text-muted-foreground">
                    of {batchWeight || "—"} g target
                  </span>
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-xs italic",
                    items.length === 0
                      ? "text-muted-foreground"
                      : Math.abs(deltaGrams) < 0.005
                        ? "text-brass"
                        : deltaGrams > 0
                          ? "text-seal"
                          : "text-muted-foreground",
                  )}
                >
                  {items.length === 0
                    ? "Nothing weighed in yet."
                    : Math.abs(deltaGrams) < 0.005
                      ? "Target met to the gram."
                      : deltaGrams > 0
                        ? `${formatGrams(deltaGrams)} g over target.`
                        : `${formatGrams(-deltaGrams)} g under target.`}
                </p>
              </div>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full gap-1.5 sm:w-auto"
              >
                <Check className="size-4" />
                {saving ? "Filing…" : "File this formula"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  );
}
