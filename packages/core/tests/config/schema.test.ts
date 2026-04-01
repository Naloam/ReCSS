import { describe, expect, it } from "vitest";

import { normalizeConfig } from "../../src/config/schema.js";

describe("normalizeConfig", () => {
  it("should apply defaults for missing fields", () => {
    const config = normalizeConfig({});

    expect(config.framework).toBe("auto");
    expect(config.css.include).toEqual([]);
    expect(config.sources.exclude).toEqual([]);
    expect(config.report.format).toBe("console");
    expect(config.safelist).toEqual([]);
  });

  it("should keep safelist regex and strings", () => {
    const config = normalizeConfig({
      safelist: ["active", /^is-/],
    });

    expect(config.safelist[0]).toBe("active");
    expect(config.safelist[1]).toEqual(/^is-/);
  });

  it("should accept html report format", () => {
    const config = normalizeConfig({
      report: {
        format: "html",
      },
    });

    expect(config.report.format).toBe("html");
  });

  it("should accept markdown report format", () => {
    const config = normalizeConfig({
      report: {
        format: "markdown",
      },
    });

    expect(config.report.format).toBe("markdown");
  });
});
