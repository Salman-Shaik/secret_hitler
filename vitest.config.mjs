import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.unit.{js,jsx}", "tests/game.test.js"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib/**/*.js", "app/**/*.{js,jsx}"],
      reporter: ["text", "html", "json", "json-summary"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
    restoreMocks: true,
  },
});
