import { describe, expect, it } from "vitest";

import { renderMarkdownReport } from "../../src/reporter/markdown.js";

describe("renderMarkdownReport", () => {
  it("should render summary and markdown table", () => {
    const output = renderMarkdownReport("/workspace", {
      unused: {
        unused: [
          {
            name: "card-ghost",
            definitions: [
              {
                name: "card-ghost",
                selector: ".card-ghost",
                file: "/workspace/src/styles/card.scss",
                line: 12,
                column: 1,
                specificity: [0, 1, 0],
                properties: ["display"],
                declarations: [
                  {
                    property: "display",
                    value: "none",
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

    expect(output).toContain("# ReCSS Analysis Report");
    expect(output).toContain("- Referenced classes: 1");
    expect(output).toContain("- Used CSS classes: 2");
    expect(output).toContain("| File | Line | Class | Selector |");
    expect(output).toContain(
      "| src/styles/card.scss | 12 | .card-ghost | .card-ghost |",
    );
  });
});
