import { api } from "@/convex/_generated/api";
import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";

/**
 * The ingredient shelf for the composer. On the very first open it installs the
 * starter materials (idempotent — it only fills an empty shelf, and only tries
 * once per mount so React StrictMode can't double-file it).
 *
 * Returns `undefined` while loading, then the material list.
 */
export function useStarterMaterials() {
  const materials = useQuery(api.rawMaterials.list);
  const ensureStarterKit = useMutation(api.rawMaterials.ensureStarterKit);
  const attempted = useRef(false);

  useEffect(() => {
    if (materials === undefined) return; // still loading
    if (materials.length > 0) return; // shelf already stocked
    if (attempted.current) return;
    attempted.current = true;

    ensureStarterKit().catch((error) => {
      console.error("Could not stock the starter shelf:", error);
    });
  }, [materials, ensureStarterKit]);

  return materials;
}
