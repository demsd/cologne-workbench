import { defineConfig } from "vitest/config";

/**
 * Two projects: the pure library tests run in plain node; Convex function
 * tests run in the edge-runtime environment to match the Convex runtime
 * (per the Convex testing docs).
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "lib",
          include: ["src/lib/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "convex",
          include: ["src/convex/**/*.test.ts"],
          environment: "edge-runtime",
        },
      },
    ],
  },
});
