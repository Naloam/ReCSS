import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeProject } from "../../src/analyzer/index.js";

describe("analyzeProject", () => {
  it("should detect unused classes in vue fixture project", async () => {
    const result = await analyzeProject({
      root: "./tests/fixtures/vue-basic",
      framework: "vue",
      safelist: [],
    });

    const unusedNames = result.unused.unused.map((item) => item.name);

    expect(unusedNames).toContain("button--ghost");
    expect(unusedNames).not.toContain("button");
    expect(unusedNames).not.toContain("button--primary");
  });

  it("should fall back to default scan patterns when include arrays are empty", async () => {
    const result = await analyzeProject({
      root: "./tests/fixtures/vue-basic",
      framework: "vue",
      safelist: [],
      cssInclude: [],
      cssExclude: [],
      sourceInclude: [],
      sourceExclude: [],
    });

    const unusedNames = result.unused.unused.map((item) => item.name);

    expect(unusedNames).toContain("button--ghost");
    expect(unusedNames).not.toContain("button");
  });

  it("should detect class usage from react ts sources when default patterns are used", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-analyze-react-ts-"));

    try {
      await mkdir(resolve(root, "src"), { recursive: true });
      await writeFile(resolve(root, "src/theme.css"), ".dark {}", "utf8");
      await writeFile(
        resolve(root, "src/theme.ts"),
        [
          "export function applyTheme(root: HTMLElement) {",
          '  root.classList.add("dark");',
          "}",
          "",
        ].join("\n"),
        "utf8",
      );

      const result = await analyzeProject({
        root,
        framework: "react",
        safelist: [],
      });

      const unusedNames = result.unused.unused.map((item) => item.name);

      expect(unusedNames).not.toContain("dark");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
