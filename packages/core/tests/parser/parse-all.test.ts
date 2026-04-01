import { describe, expect, it } from "vitest";

import { parseAll } from "../../src/parser/index.js";

describe("parseAll", () => {
  it("should merge css parse result with used and uncertain classes from source parsers", async () => {
    const result = await parseAll({
      cssFiles: ["/missing.css"],
      vueFiles: [],
      jsxFiles: [],
      htmlFiles: [],
    });

    expect(result.cssResult.size).toBe(0);
    expect(result.usedClasses.size).toBe(0);
    expect(result.uncertainClasses.size).toBe(0);
  });
});
