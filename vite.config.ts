import { defineConfig } from "vitest/config";
import { contentPlugin } from "./scripts/vite-plugin-content";

export default defineConfig({
  // GitHub Pages の https://<user>.github.io/<repo>/ でも動くよう相対パスにする
  base: "./",
  plugins: [contentPlugin()],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
