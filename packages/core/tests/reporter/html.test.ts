import { describe, expect, it } from "vitest";

import { renderHtmlReport } from "../../src/reporter/html.js";

describe("renderHtmlReport", () => {
  it("should render summary cards and unused class rows", () => {
    const output = renderHtmlReport("/workspace", {
      unused: {
        unused: [
          {
            name: "card<ghost>",
            definitions: [
              {
                name: "card<ghost>",
                selector: ".card<ghost>",
                file: "/workspace/src/styles/card.scss",
                line: 12,
                column: 1,
                specificity: [0, 1, 0],
                properties: ["display"],
                declarations: [
                  {
                    property: "display",
                    value: "block",
                    important: false,
                  },
                ],
              },
            ],
          },
        ],
        skipped: [],
        stats: {
          totalCssClasses: 3,
          usedClasses: 1,
          unusedClasses: 1,
          uncertainClasses: 1,
          safelistedClasses: 0,
        },
      },
    });

    expect(output).toContain("<title>ReCSS Analysis Report</title>");
    expect(output).toContain("src/styles/card.scss");
    expect(output).toContain(".card&lt;ghost&gt;");
    expect(output).toContain("Unused Classes");
  });
});
