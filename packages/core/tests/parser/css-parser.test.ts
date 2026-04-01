import { describe, expect, it } from "vitest";

import { parseCssCode } from "../../src/parser/css-parser.js";

describe("parseCssCode", () => {
  it("should extract class definitions from regular selectors", async () => {
    const result = await parseCssCode(
      "/virtual/styles.scss",
      ".button { color: red; background: white; }",
    );

    const definitions = result.get("button");
    expect(definitions).toBeDefined();
    expect(definitions).toHaveLength(1);
    expect(definitions?.[0].selector).toBe(".button");
    expect(definitions?.[0].properties).toEqual(["color", "background"]);
  });

  it("should resolve nested scss selectors", async () => {
    const result = await parseCssCode(
      "/virtual/nested.scss",
      [
        ".card {",
        "  &__title { color: black; }",
        "  .icon { width: 10px; }",
        "}",
      ].join("\n"),
    );

    const titleDefinitions = result.get("card__title");
    const iconDefinitions = result.get("icon");

    expect(titleDefinitions?.[0].selector).toBe(".card__title");
    expect(iconDefinitions?.[0].selector).toBe(".card .icon");
  });

  it("should extract class names from pseudo selectors", async () => {
    const result = await parseCssCode(
      "/virtual/pseudo.scss",
      '.item:hover::before { content: ""; }',
    );

    const definitions = result.get("item");
    expect(definitions).toHaveLength(1);
    expect(definitions?.[0].selector).toBe(".item:hover::before");
  });

  it("should split multiple selectors into separate definitions", async () => {
    const result = await parseCssCode(
      "/virtual/multi.scss",
      ".a, .b.active { color: red; }",
    );

    const aDefinitions = result.get("a");
    const bDefinitions = result.get("b");
    const activeDefinitions = result.get("active");

    expect(aDefinitions).toHaveLength(1);
    expect(aDefinitions?.[0].selector).toBe(".a");
    expect(bDefinitions).toHaveLength(1);
    expect(bDefinitions?.[0].selector).toBe(".b.active");
    expect(activeDefinitions).toHaveLength(1);
  });

  it("should skip rules inside keyframes and font-face", async () => {
    const result = await parseCssCode(
      "/virtual/at-rules.scss",
      [
        "@keyframes pulse {",
        "  .ghost { opacity: 0; }",
        "}",
        "@font-face {",
        '  .font-helper { font-family: "X"; }',
        "}",
        ".real { color: red; }",
      ].join("\n"),
    );

    expect(result.has("ghost")).toBe(false);
    expect(result.has("font-helper")).toBe(false);
    expect(result.get("real")).toHaveLength(1);
  });
});
