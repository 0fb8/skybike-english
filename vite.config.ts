import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages の https://<user>.github.io/<repo>/ でも動くよう相対パスにする
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
