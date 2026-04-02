import { describe, expect, it } from "vitest";

import {
  createRefreshRequest,
  formatRefreshSummary,
  isRelevantRefreshPath,
  mergeRefreshRequests,
  resolveRefreshTargets,
  summarizeRefreshResults,
} from "../src/refresh.js";

describe("mergeRefreshRequests", () => {
  it("should merge folder-scoped refreshes and keep the latest reason", () => {
    const merged = mergeRefreshRequests(
      createRefreshRequest("save:Button.vue", "folder-a"),
      createRefreshRequest("save:app.scss", "folder-b"),
    );

    expect(merged).toEqual({
      reason: "save:app.scss",
      targets: ["folder-a", "folder-b"],
    });
  });

  it("should promote the request to all folders when needed", () => {
    const merged = mergeRefreshRequests(
      createRefreshRequest("save:Button.vue", "folder-a"),
      createRefreshRequest("manual-command"),
    );

    expect(merged).toEqual({
      reason: "manual-command",
      targets: "all",
    });
  });
});

describe("resolveRefreshTargets", () => {
  it("should keep only workspace folders that still exist", () => {
    const targets = resolveRefreshTargets(
      {
        reason: "save:Button.vue",
        targets: ["folder-a", "folder-gone"],
      },
      ["folder-a", "folder-b"],
    );

    expect(targets).toEqual(["folder-a"]);
  });
});

describe("formatRefreshSummary", () => {
  it("should include skipped and failed folder counts in the summary", () => {
    const summary = summarizeRefreshResults("manual-command", [
      {
        status: "refreshed",
        filesWithDiagnostics: 2,
        unusedClasses: 3,
      },
      {
        status: "skipped",
      },
      {
        status: "failed",
      },
    ]);

    expect(formatRefreshSummary(summary)).toBe(
      "[recss] Refresh completed (manual-command): 1 workspace folder refreshed, 1 skipped, 1 failed. 3 unused classes across 2 files.",
    );
  });
});

describe("isRelevantRefreshPath", () => {
  it("should refresh for supported style, source, and config files", () => {
    expect(isRelevantRefreshPath("/workspace/src/App.vue")).toBe(true);
    expect(isRelevantRefreshPath("/workspace/src/styles/button.scss")).toBe(true);
    expect(isRelevantRefreshPath("/workspace/package.json")).toBe(true);
    expect(isRelevantRefreshPath("/workspace/recss.config.ts")).toBe(true);
  });

  it("should ignore unrelated file extensions", () => {
    expect(isRelevantRefreshPath("/workspace/src/index.ts")).toBe(false);
    expect(isRelevantRefreshPath("/workspace/README.md")).toBe(false);
  });
});
