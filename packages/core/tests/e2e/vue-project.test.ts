import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeProject,
  analyzeSpecificity,
  parseAll,
  scanFiles,
} from "../../src/index.js";

const fixtureRoot = resolve(__dirname, "../fixtures/vue-project");

describe("vue-project e2e", () => {
  it("should detect unused classes correctly", async () => {
    const result = await analyzeProject({
      root: fixtureRoot,
      framework: "vue",
      safelist: [],
    });

    const unusedNames = result.unused.unused.map((item) => item.name);

    expect(unusedNames).toContain("card-ghost");
    expect(unusedNames).toContain("card-overlay");
    expect(unusedNames).toContain("btn-ghost");
    expect(unusedNames).not.toContain("btn-primary");
  });

  it("should keep dynamic class references out of unused list", async () => {
    const result = await analyzeProject({
      root: fixtureRoot,
      framework: "vue",
      safelist: [],
    });

    const unusedNames = result.unused.unused.map((item) => item.name);

    expect(unusedNames).not.toContain("dynamicClass");
  });

  it("should detect specificity conflict on btn-primary color", async () => {
    const scanResult = await scanFiles({
      root: fixtureRoot,
      cssInclude: ["src/**/*.{css,scss}"],
      cssExclude: [],
      sourceInclude: ["src/**/*.{vue,tsx,jsx,html}"],
      sourceExclude: [],
    });

    const parsed = await parseAll(scanResult);
    const specificity = analyzeSpecificity(parsed.cssResult);

    const conflict = specificity.conflicts.find(
      (item) => item.className === "btn-primary" && item.property === "color",
    );

    expect(conflict).toBeDefined();
  });
});
