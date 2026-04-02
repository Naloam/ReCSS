import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  CodeAction: class CodeAction {
    command?: {
      command: string;
      title: string;
    };
    diagnostics?: unknown[];

    constructor(
      public readonly title: string,
      public readonly kind?: unknown,
    ) {}
  },
  CodeActionKind: class CodeActionKind {
    static readonly QuickFix = new CodeActionKind("quickfix");

    constructor(public readonly value: string) {}
  },
}));

import {
  CLEAR_DIAGNOSTICS_COMMAND,
  createDiagnosticCodeActions,
  REFRESH_ANALYSIS_COMMAND,
} from "../src/code-actions.js";
import { RECSS_DIAGNOSTIC_CODE } from "../src/diagnostics.js";

describe("createDiagnosticCodeActions", () => {
  it("should provide refresh and clear actions for recss diagnostics", () => {
    const actions = createDiagnosticCodeActions({
      diagnostics: [
        {
          code: RECSS_DIAGNOSTIC_CODE,
          message: 'Unused CSS class ".card" is not referenced.',
          range: {
            end: {
              character: 5,
              line: 0,
            },
            start: {
              character: 0,
              line: 0,
            },
          },
          severity: 1,
          source: "recss",
        },
      ],
    } as never);

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      title: "ReCSS: Refresh Analysis",
      command: {
        command: REFRESH_ANALYSIS_COMMAND,
        title: "ReCSS: Refresh Analysis",
      },
    });
    expect(actions[1]).toMatchObject({
      title: "ReCSS: Clear Diagnostics",
      command: {
        command: CLEAR_DIAGNOSTICS_COMMAND,
        title: "ReCSS: Clear Diagnostics",
      },
    });
  });

  it("should ignore diagnostics from other sources", () => {
    const actions = createDiagnosticCodeActions({
      diagnostics: [
        {
          code: "unused-var",
          message: "Variable is declared but never used.",
          range: {
            end: {
              character: 5,
              line: 0,
            },
            start: {
              character: 0,
              line: 0,
            },
          },
          severity: 1,
          source: "eslint",
        },
      ],
    } as never);

    expect(actions).toEqual([]);
  });
});
