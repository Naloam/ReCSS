import { describe, expect, it } from "vitest";

import { analyzeSpecificity } from "../../src/analyzer/specificity.js";
import type { CssParseResult } from "../../src/types.js";

function createCssResult(): CssParseResult {
  return new Map([
    [
      "btn-primary",
      [
        {
          name: "btn-primary",
          selector: ".btn-primary",
          file: "/virtual/base.scss",
          line: 10,
          column: 1,
          specificity: [0, 1, 0],
          properties: ["color"],
          declarations: [
            {
              property: "color",
              value: "red",
              important: false,
            },
          ],
        },
        {
          name: "btn-primary",
          selector: ".theme .btn-primary",
          file: "/virtual/theme.scss",
          line: 20,
          column: 1,
          specificity: [0, 2, 0],
          properties: ["color"],
          declarations: [
            {
              property: "color",
              value: "blue",
              important: false,
            },
          ],
        },
      ],
    ],
    [
      "alert",
      [
        {
          name: "alert",
          selector: ".alert",
          file: "/virtual/alert.scss",
          line: 5,
          column: 1,
          specificity: [0, 1, 0],
          properties: ["margin"],
          declarations: [
            {
              property: "margin",
              value: "4px",
              important: true,
            },
          ],
        },
      ],
    ],
  ]);
}

describe("analyzeSpecificity", () => {
  it("should detect conflicts when same class property has different specificity", () => {
    const result = analyzeSpecificity(createCssResult());

    expect(result.stats.totalConflicts).toBe(1);
    expect(result.conflicts[0]?.className).toBe("btn-primary");
    expect(result.conflicts[0]?.property).toBe("color");
    expect(result.conflicts[0]?.definitions[0]?.specificity).toEqual([0, 2, 0]);
  });

  it("should collect definitions that use !important", () => {
    const result = analyzeSpecificity(createCssResult());

    expect(result.stats.importantCount).toBe(1);
    expect(result.importantUsage[0]?.name).toBe("alert");
  });
});
