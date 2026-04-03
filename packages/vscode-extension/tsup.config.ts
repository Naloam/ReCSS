import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    extension: "src/extension.ts",
  },
  format: ["cjs"],
  target: "node18",
  sourcemap: true,
  clean: true,
  dts: false,
  external: ["vscode", "recss-core"],
});
