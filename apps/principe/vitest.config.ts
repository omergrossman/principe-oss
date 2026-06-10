import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests for pure/security-critical logic (no DB, no network). Component
// and integration tests can layer on later with a jsdom environment.
export default defineConfig({
  // ignoreConfigErrors: the sibling workspace packages have their own
  // tsconfigs the resolver doesn't need — silence its parse warnings.
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
