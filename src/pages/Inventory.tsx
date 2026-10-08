import { api } from "@/convex/_generated/api";
import {
  MATERIAL_CATEGORIES,
  OLFACTIVE_GROUPS,
  type MaterialCategory,
  type OlfactiveGroup,
} from "@/convex/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useStarterMaterials } from "@/hooks/use-starter-materials";
import { parseInventoryCsv, toInventoryCsv } from "@/lib/csv";
import { formatGrams } from "@/lib/formula-math";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

type ShelfMaterial = NonNullable<
  ReturnType<typeof useStarterMaterials>
>[number];

const money = (value: number) => `$${value.toFixed(2)}`;

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="label-caps">{label}</Label>
      {children}
    </div>
  );
}

export default function Inventory() {
  const materials = useStarterMaterials();
  const updateMaterial = useMutation(api.rawMaterials.update);
  const addMaterial = useMutation(api.rawMaterials.add);
  const removeMaterial = useMutation(api.rawMaterials.remove);
  const bulkUpsert = useMutation(api.rawMaterials.bulkUpsert);

  // ——— Filters ———
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<"All" | OlfactiveGroup>("All");
  const [lowOnly, setLowOnly] = useState(false);

  // ——— Add / edit dialog ———
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShelfMaterial | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "Fragrance Oil" as MaterialCategory,
    group: "Top" as OlfactiveGroup,
    initial: "",
    remaining: "",
    price: "",
    vendor: "",
    threshold: "56.7",
    // Notes stay data-only (CSV import/export); the dialog no longer edits them.
    notes: [] as string[],
  });
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // ——— Delete ———
  const [deleting, setDeleting] = useState<ShelfMaterial | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ——— CSV import ———
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<
    ReturnType<typeof parseInventoryCsv> | null
  >(null);

  const [busy, setBusy] = useState<null | "save" | "import">(null);

  /** Stable reference so the memos below don’t recompute every render. */
  const shelf = useMemo(() => materials ?? [], [materials]);

  const stats = useMemo(() => {
    const grams = shelf.reduce((sum, m) => sum + m.remainingGrams, 0);
    const value = shelf.reduce(
      (sum, m) => sum + m.remainingGrams * m.pricePerGram,
      0,
    );
    const low = shelf.filter((m) => m.isLow).length;
    return { grams, value, low };
  }, [shelf]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return shelf.filter((material) => {
      if (groupFilter !== "All" && material.olfactiveGroup !== groupFilter) {
        return false;
      }
      if (lowOnly && !material.isLow) return false;
      if (needle) {
        const inName = material.name.toLowerCase().includes(needle);
        const inVendor = (material.vendor ?? "")
          .toLowerCase()
          .includes(needle);
        if (!inName && !inVendor) return false;
      }
      return true;
    });
  }, [shelf, search, groupFilter, lowOnly]);

  // ——— Add / edit ———
  function openAdd() {
    setEditing(null);
    setForm({
      name: "",
      category: "Fragrance Oil",
      group: "Top",
      initial: "",
      remaining: "",
      price: "",
      vendor: "",
      threshold: "56.7",
      notes: [],
    });
    setFormErrors([]);
    setDialogOpen(true);
  }

  function openEdit(material: ShelfMaterial) {
    setEditing(material);
    setForm({
      name: material.name,
      category: material.category,
      group: material.olfactiveGroup,
      initial: String(material.initialGrams),
      remaining: String(material.remainingGrams),
      price: String(material.price),
      vendor: material.vendor ?? "",
      threshold: String(material.lowStockThreshold ?? 56.7),
      notes: material.notes ? [...material.notes] : [],
    });
    setFormErrors([]);
    setDialogOpen(true);
  }

  function validateForm(): string[] {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push("A material needs a name.");
    const initial = Number(form.initial);
    const remaining = Number(form.remaining || form.initial);
    const price = Number(form.price);
    const threshold = Number(form.threshold);
    for (const [label, value] of [
      ["Initial grams", initial],
      ["Remaining grams", remaining],
      ["Price", price],
      ["Low-stock threshold", threshold],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        errs.push(`${label} must be a number at or above zero.`);
      }
    }
    return errs;
  }

  async function saveMaterial() {
    const errs = validateForm();
    setFormErrors(errs);
    if (errs.length > 0) return;

    setBusy("save");
    try {
      const args = {
        name: form.name.trim(),
        category: form.category,
        olfactiveGroup: form.group,
        initialGrams: Number(form.initial),
        remainingGrams: form.remaining
          ? Number(form.remaining)
          : Number(form.initial),
        price: Number(form.price),
        vendor: form.vendor.trim() || undefined,
        notes: form.notes,
      };
      if (editing) {
        await updateMaterial({
          id: editing._id,
          ...args,
          lowStockThreshold: Number(form.threshold),
        });
        toast.success("Material updated", { description: args.name });
      } else {
        await addMaterial({
          ...args,
          lowStockThreshold: Number(form.threshold),
        });
        toast.success("Material added to the shelf", {
          description: `${args.name} · ${money(args.price)}`,
        });
      }
      setDialogOpen(false);
    } catch (error) {
      setFormErrors([
        error instanceof Error ? error.message : "The shelf refused the entry.",
      ]);
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const result = await removeMaterial({ id: deleting._id });
      toast.success("Material removed from the shelf", {
        description: result.removedName,
      });
      setDeleting(null);
    } catch (error) {
      toast.error("Cannot remove this material", {
        description:
          error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setDeleteBusy(false);
    }
  }

  // ——— CSV ———
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
      setPreview(null);
    };
    reader.readAsText(file);
  }

  async function applyImport() {
    if (!preview || preview.rows.length === 0 || busy) return;
    setBusy("import");
    try {
      const result = await bulkUpsert({ rows: preview.rows });
      toast.success("Price list applied", {
        description: `${result.updated} updated · ${result.inserted} added.`,
      });
      setImportOpen(false);
      setCsvText("");
      setPreview(null);
    } catch (error) {
      toast.error("The import was refused", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    const csv = toInventoryCsv(shelf);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cologne-workbench-inventory.csv";
    anchor.click();
    URL.revokeObjectURL(url);
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
            Stock room · {shelf.length} materials
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
              <div className="ornament max-w-44">
                <span />
              </div>
              <p className="label-caps mt-5">Stock room</p>
              <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                Inventory
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground italic">
                Grams on the shelf, what they cost, and when to reorder —
                weighing a batch deducts its actual grams automatically.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setImportOpen(true);
                  setPreview(null);
                }}
              >
                <Upload className="size-4" />
                Import CSV
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={exportCsv}
              >
                <Download className="size-4" />
                Export CSV
              </Button>
              <Button className="gap-1.5" onClick={openAdd}>
                <Plus className="size-4" />
                New material
              </Button>
            </div>
          </div>

          {/* ——— Stats ——— */}
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border/70 py-5 md:grid-cols-4">
            <div>
              <dt className="label-caps">Materials</dt>
              <dd className="mt-1.5 font-display text-3xl font-semibold">
                {shelf.length}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Grams on the shelf</dt>
              <dd className="mt-1.5 font-mono text-2xl font-bold">
                {stats.grams.toFixed(1)} g
              </dd>
            </div>
            <div>
              <dt className="label-caps">Shelf value</dt>
              <dd className="mt-1.5 font-mono text-2xl font-bold">
                {money(stats.value)}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Low stock</dt>
              <dd
                className={cn(
                  "mt-1.5 font-display text-3xl font-semibold",
                  stats.low > 0 && "text-seal",
                )}
              >
                {stats.low}
              </dd>
            </div>
          </dl>

          {/* ——— Toolbar ——— */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search materials or vendors…"
              aria-label="Search materials"
              className="h-10 w-full max-w-xs"
            />
            <Select
              value={groupFilter}
              onValueChange={(value) =>
                setGroupFilter(value as "All" | OlfactiveGroup)
              }
            >
              <SelectTrigger className="h-10 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All groups</SelectItem>
                {OLFACTIVE_GROUPS.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={lowOnly}
                onCheckedChange={setLowOnly}
                aria-label="Show low stock only"
              />
              Low stock only
            </label>
            <span className="label-caps ml-auto">
              {filtered.length} shown
            </span>
          </div>

          {/* ——— The shelf ——— */}
          <div className="mt-4 overflow-hidden rounded-lg border border-border/70 bg-card/70 paper-sheet">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="label-caps">Material</TableHead>
                    <TableHead className="w-24 label-caps">Group</TableHead>
                    <TableHead className="w-40 label-caps">
                      Remaining
                    </TableHead>
                    <TableHead className="hidden w-24 text-right label-caps md:table-cell">
                      Initial g
                    </TableHead>
                    <TableHead className="w-24 text-right label-caps">
                      Price
                    </TableHead>
                    <TableHead className="hidden w-24 text-right label-caps md:table-cell">
                      $/g
                    </TableHead>
                    <TableHead className="hidden w-24 text-right label-caps lg:table-cell">
                      Reorder at
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={8}
                        className="py-12 text-center text-sm text-muted-foreground italic"
                      >
                        Nothing on the shelf matches that.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((material) => {
                      const pct =
                        material.initialGrams > 0
                          ? Math.max(
                              0,
                              Math.min(
                                100,
                                (material.remainingGrams /
                                  material.initialGrams) *
                                  100,
                              ),
                            )
                          : 0;
                      return (
                        <TableRow
                          key={material._id}
                          className={cn(
                            "transition-colors hover:bg-accent/30",
                            material.isLow && "bg-destructive/5",
                          )}
                        >
                          <TableCell
                            className={cn(
                              material.isLow && "border-l-2 border-l-destructive",
                            )}
                          >
                            <span className="font-medium">
                              {material.name}
                            </span>
                            {material.isLow ? (
                              <span className="stamp ml-2 align-middle text-seal">
                                Low
                              </span>
                            ) : null}
                            <span className="block text-xs text-muted-foreground italic">
                              {material.vendor ?? "—"} · {material.category}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {material.olfactiveGroup}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "font-mono text-sm font-bold",
                                material.isLow && "text-seal",
                              )}
                            >
                              {formatGrams(material.remainingGrams)} g
                            </span>
                            <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full border border-border/60 bg-muted">
                              <span
                                className={cn(
                                  "block h-full",
                                  material.isLow
                                    ? "bg-destructive/70"
                                    : "bg-brass/70",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                          </TableCell>
                          <TableCell className="hidden text-right font-mono text-sm text-muted-foreground md:table-cell">
                            {formatGrams(material.initialGrams)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {money(material.price)}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono text-sm text-muted-foreground md:table-cell">
                            ${material.pricePerGram.toFixed(4)}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono text-sm text-muted-foreground lg:table-cell">
                            {formatGrams(material.lowStockThreshold ?? 56.7)} g
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit ${material.name}`}
                              onClick={() => openEdit(material)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${material.name}`}
                              onClick={() => setDeleting(material)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <p className="mt-4 text-xs text-muted-foreground italic">
            Import overwrites grams and prices for materials matched by name,
            and adds unknown names as new materials.
          </p>
        </motion.div>
      </div>

      {/* ——— Add / edit dialog ——— */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editing ? `Edit ${editing.name}` : "New material"}
            </DialogTitle>
            <DialogDescription className="italic">
              {editing
                ? "Update the particulars and stock figures."
                : "A new bottle for the shelf."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, name: event.target.value }))
                  }
                  placeholder="e.g. Bergamot Oil"
                  className="h-10"
                />
              </Field>
            </div>
            <Field label="Category">
              <Select
                value={form.category}
                onValueChange={(value) =>
                  setForm((f) => ({
                    ...f,
                    category: value as MaterialCategory,
                  }))
                }
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Group">
              <Select
                value={form.group}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, group: value as OlfactiveGroup }))
                }
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OLFACTIVE_GROUPS.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Initial grams">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.initial}
                onChange={(event) =>
                  setForm((f) => ({ ...f, initial: event.target.value }))
                }
                className="h-10 text-right font-mono"
              />
            </Field>
            <Field label="Remaining grams">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.remaining}
                onChange={(event) =>
                  setForm((f) => ({ ...f, remaining: event.target.value }))
                }
                placeholder={form.initial || "0"}
                className="h-10 text-right font-mono"
              />
            </Field>
            <Field label="Price of the pack ($)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) =>
                  setForm((f) => ({ ...f, price: event.target.value }))
                }
                className="h-10 text-right font-mono"
              />
            </Field>
            <Field label="Reorder at (g)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.threshold}
                onChange={(event) =>
                  setForm((f) => ({ ...f, threshold: event.target.value }))
                }
                className="h-10 text-right font-mono"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Vendor">
                <Input
                  value={form.vendor}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, vendor: event.target.value }))
                  }
                  placeholder="e.g. Hermitage"
                  className="h-10"
                />
              </Field>
            </div>
          </div>

          {formErrors.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
              {formErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="gap-1.5"
            >
              Cancel
            </Button>
            <Button
              onClick={saveMaterial}
              disabled={busy === "save"}
              className="gap-1.5"
            >
              {busy === "save"
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Add to shelf"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ——— Delete confirmation ——— */}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {deleting?.name} from the shelf?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The material leaves the inventory for good. Materials that are
              part of a formula version or a weighed batch are protected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteBusy ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ——— CSV import dialog ——— */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              Import a vendor price list
            </DialogTitle>
            <DialogDescription className="italic">
              Columns: Fragrance Name, Group, Initial Grams, Remaining Grams,
              Price, $/g (ignored), Vendor — plus optional Category and Notes
              (semicolon-separated).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="h-10"
            />
            <Textarea
              value={csvText}
              onChange={(event) => {
                setCsvText(event.target.value);
                setPreview(null);
              }}
              rows={6}
              placeholder={"Fragrance Name,Group,Initial Grams,Remaining Grams,Price,Price per Gram,Vendor\nBergamot Oil,Top,100,100,18.50,0.185,Hermitage"}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={csvText.trim().length === 0}
              onClick={() => setPreview(parseInventoryCsv(csvText))}
            >
              Preview import
            </Button>
          </div>

          {preview ? (
            <div className="space-y-3">
              <p className="label-caps">
                {preview.rows.length} row{preview.rows.length === 1 ? "" : "s"}{" "}
                ready · {preview.errors.length} problem
                {preview.errors.length === 1 ? "" : "s"}
              </p>
              {preview.errors.length > 0 ? (
                <ul className="max-h-24 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-destructive">
                  {preview.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
              {preview.rows.length > 0 ? (
                <div className="max-h-56 overflow-y-auto rounded-md border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="label-caps">Material</TableHead>
                        <TableHead className="label-caps">Group</TableHead>
                        <TableHead className="text-right label-caps">
                          Remaining
                        </TableHead>
                        <TableHead className="text-right label-caps">
                          Price
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.slice(0, 50).map((row) => {
                        const exists = shelf.some(
                          (m) => m.name.toLowerCase() === row.name.toLowerCase(),
                        );
                        return (
                          <TableRow key={row.name}>
                            <TableCell>
                              {row.name}
                              <span className="label-caps ml-2">
                                {exists ? "updates" : "adds"}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {row.olfactiveGroup}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatGrams(row.remainingGrams)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {money(row.price)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setImportOpen(false)}
              className="gap-1.5"
            >
              Cancel
            </Button>
            <Button
              onClick={applyImport}
              disabled={!preview || preview.rows.length === 0 || busy === "import"}
              className="gap-1.5"
            >
              <AlertTriangle className="size-4" />
              {busy === "import"
                ? "Applying…"
                : `Apply ${preview?.rows.length ?? 0} row${preview?.rows.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
