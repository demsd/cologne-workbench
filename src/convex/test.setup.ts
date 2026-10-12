/// <reference types="vite/client" />

/**
 * Every Convex function module, for `convex-test`. The pattern matches files
 * with a single extension (js/ts) and skips double-dotted names — which
 * excludes this file, the *.test.ts files, and the .d.ts generated types.
 * (Canonical setup from the Convex testing docs.)
 */
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
