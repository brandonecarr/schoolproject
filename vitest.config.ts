import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// tsconfigPaths lets the tests import via the "@/..." alias, same as the app.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
