import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The suites share one database, so they must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
