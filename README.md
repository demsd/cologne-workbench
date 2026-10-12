## Overview

Cologne Workbench is a single-perfumer formulation ledger — an alternative to
[TapputiLab.com](https://tapputilab.com) that runs locally. It does not cover
everything (IFRA, etc.), but it includes:

* **Formulas & versioning** — file formulas with weighed ingredients,
  percentages that settle to exactly 100.00, and a version lineage. A version
  can be **edited in place** (same node, batches and labels stay linked) or
  **revised as a new version** (v1 → v1.1, linked by `parentId`).
* **Scale calculator** — scale a formula to any target grams (×2/×3/×4
  presets or a custom total) instantly, without touching the ledger.
* **Weighing bench** — work through a pour with live rescaling when the scale
  disagrees with the plan; each pour files an immutable production batch.
* **Label printing** — labels queue automatically when a batch is filed
  (name, version, concentration, total amount, description). Print on A4 grid
  sheets (Avery L7160/L7163/L7654 + custom grids with partial-sheet offsets)
  or direct 58/80 mm thermal rolls, with off-sheet validation before anything
  reaches the printer.
* **CSV importation of inventory** — vendor, total grams, remaining grams,
  total cost and price per gram.
* **Note Picker** — select top/middle/base notes and get the formulas that
  use them.
* **Backup & export** — everything as JSON (shelf, formulas, batch records),
  plus the vendor price list.

## Tech stack

- React 19 + TypeScript + Vite
- React Router v7 (imports come from `react-router`, not `react-router-dom`)
- Tailwind v4 + shadcn/ui + Lucide icons
- Framer Motion (animations)
- Convex (backend, database, and reactive client)
- Vitest + convex-test (unit tests for pure logic and Convex functions)
- Convex Auth: **removed** — the app has no sign-in (see below)

Package manager: **Bun** in this cloud sandbox (run `bun install`), **npm** on
a local machine (`npm install`). Both lockfiles are committed; keep them in
sync when you change dependencies.

## Architecture

```
src/
├── main.tsx              # Entry: ConvexProvider → BrowserRouter → lazy routes
├── pages/                # One component per route (see routes in main.tsx)
├── components/           # App components; shadcn primitives in components/ui
├── hooks/                # use-starter-materials, use-mobile
├── lib/                  # PURE logic — shared by the UI *and* the backend
│   ├── formula-math.ts   # rounding, percentages, version numbering, rescale
│   └── label-templates.ts# A4/thermal sheet geometry, placement, fit checks
└── convex/               # Backend: schema + queries/mutations
    ├── schema.ts         # tables: rawMaterials, formulas, formulaItems,
    │                     # productionBatches, batchItems, labels, …
    ├── formulas.ts       # create / update (in-place edit) / remove / lineage
    ├── batches.ts        # the pour: batch + items + label in one transaction
    ├── labels.ts         # the label queue: list / enqueue / markPrinted
    ├── rawMaterials.ts   # the shelf: CSV upsert, stock adjustments
    └── _generated/       # codegen (api, dataModel, server) — never hand-edit
```

A key design decision: **`src/lib` is imported by the Convex backend itself**
(`formulas.ts`, `batches.ts` and `rawMaterials.ts` all use
`formula-math`). The composer's live preview and the numbers written at file
time run the same algorithm — what you see is what gets filed.

### Request flow

```
page component (src/pages)
  └─ useQuery(api.formulas.get, …) / useMutation(api.batches.create, …)
       └─ typed function reference from src/convex/_generated/api
            └─ ConvexReactClient (provided by <ConvexProvider> in main.tsx)
                 └─ WebSocket → Convex deployment
                      └─ handler in src/convex/*.ts with a schema-validated ctx
                           └─ result written; subscribed queries re-emit
                                → component re-renders
```

* Queries are **reactive subscriptions**: anything the handler reads
  (including rows touched by other mutations) re-renders the component.
  Don't duplicate server state into local state.
* Local development runs two processes: Vite serves the frontend, and
  `npx convex dev` (or `bunx convex dev --once` in this sandbox) watches
  `src/convex`, pushes functions, and regenerates `_generated`.

### The three flows most tied to the backend files

1. **Pour** — the Weighing page calls `batches.create`: validates the record
   covers every ingredient of the formula version, writes the batch + items,
   **queues the label, and decrements shelf stock — all in one transaction**.
2. **Edit** — FormulaDetail → `/formulas/:id/edit` → `formulas.update`
   (`prepareVersion` validation shared with `create`): patches the version,
   rewrites the ingredient rows with recomputed percentages, and refreshes
   *queued* labels (printed labels are history). `/formulas/:id/revise` files
   a child version instead.
3. **Print** — the Labels page serialises the chosen template geometry into
   the print URL; `/labels/print` re-validates fit, lays labels on the sheet
   via `label-templates`, calls `window.print()`, then stamps the rows
   `printed` (`markPrinted`).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `bun run dev` | Vite dev server |
| `npx convex dev` | Convex functions + codegen (local) |
| `bunx convex dev --once` | One-shot push + codegen (sandbox/CI) |
| `npm test` / `bun run test` | Vitest, single run |
| `npm run lint` | ESLint |
| `bunx tsc -b --noEmit` | Type check |
| `npm run build` | Type check + production build |
| `npm run format` | Prettier |

## Testing

Vitest runs two projects (see `vitest.config.ts`):

* **lib** (`src/lib/*.test.ts`, node) — pure-math suites for
  `formula-math` (rounding, 100.00-percentage invariant, version numbering,
  rescale engine, formatting) and `label-templates` (Avery geometry,
  placement/paging, fit validation).
* **convex** (`src/convex/*.test.ts`, edge-runtime) — `convex-test` mocks the
  Convex backend in memory. `src/convex/test.setup.ts` exposes the function
  modules via `import.meta.glob`, and tests call the real API surface:

```ts
const t = convexTest(schema, modules);
const id = await t.mutation(api.formulas.create, { … });
await expect(t.mutation(api.formulas.update, { … })).rejects.toThrow(…);
await t.run((ctx) => ctx.db.get(id)); // direct access when needed
```

`*.test.ts` files inside `src/convex` are ignored by `convex dev`, so they
never reach the deployment.

## Environment variables

Client side (Vite): `VITE_CONVEX_URL` — the Convex deployment URL.
The Convex CLI additionally uses `CONVEX_DEPLOYMENT` locally.

There are **no auth keys**. Convex-side variables are only whatever a
particular function needs via `process.env` (none today).

## Authentication — deliberately none

This is a single-perfumer app: there is no sign-in, no auth tables, no auth
providers, and no protected routes. The former Convex Auth stack (auth.ts,
auth.config.ts, users.ts, the /auth page, RequireAuth, use-auth) was removed
entirely, which also cleared the deployment's auth-related env requirements.

Consequences to keep in mind:

* The frontend talks to Convex unauthenticated — anyone with the hosted URL
  can read and write the ledger. Fine for local/personal use; add auth back
  (properly) before exposing it publicly.
* Don't reintroduce `@convex-dev/auth` casually — the schema, provider wiring
  and routes were all stripped to remove it.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.
- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure that they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create sidebars for dashboard pages and navigate between pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.

### Other Items to animate
- Fade in and Fade Out
- Slide in and Slide out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shadcn Sonner component as the toaster, imported as `toast` from `sonner`:

```tsx
import { toast } from "sonner";

toast.success("Filed in the ledger", { description: "Elixir · V1" });
toast.error("Couldn't queue the labels", { description: "Try again." });
```

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead. Destructive
actions (deleting a formula, removing a label) must confirm first via
`AlertDialog`.

# Using the Convex backend

## The Convex Schema

The schema is defined in `src/convex/schema.ts`.

- Do not include `_id` and `_creationTime` fields in your queries (added by default per table).
- Do not index `_creationTime`; it is indexed for you. Never have duplicate indexes.
- Validators are shared value objects (`formulaStatusValidator`,
  `olfactiveGroupValidator`, …) — reuse them rather than re-declaring unions.

## Rules of thumb

- Queries/mutations live in their own files under `src/convex`; external I/O
  requires a `"use node"` action file with no queries/mutations alongside it.
- Never write return type validators; infer them.

## Common Convex Mistakes To Avoid

- Document IDs are referenced as `_id`, not `id`.
- Document ID types are `Id<"TableName">`, not `string`; document objects are `Doc<"TableName">`.
- Keep `schemaValidation` false in the schema file.
- Type your code so it passes the type checker.
- Handle null / undefined from queries on both sides — data may be missing.
- Always import with the `@/folder` paths, including generated files
  (`@/convex/_generated/api`, `@/convex/_generated/server`).
- Import `useQuery`, `useMutation`, `useAction`, etc. from `convex/react`.
- In a mutation, `undefined` in `insert`/`patch` means "field absent" — that
  is how optional fields are cleared, not a no-op.
