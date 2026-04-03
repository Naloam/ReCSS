import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  class Position {
    constructor(
      public readonly line: number,
      public readonly character: number,
    ) {}
  }

  class Range {
    readonly end: Position;
    readonly start: Position;

    constructor(
      startOrLine: number | Position,
      startCharacterOrEnd: number | Position,
      endLine?: number,
      endCharacter?: number,
    ) {
      if (
        typeof startOrLine === "object" &&
        startOrLine !== null &&
        typeof (startOrLine as Position).line === "number" &&
        typeof (startOrLine as Position).character === "number" &&
        typeof startCharacterOrEnd === "object" &&
        startCharacterOrEnd !== null &&
        typeof (startCharacterOrEnd as Position).line === "number" &&
        typeof (startCharacterOrEnd as Position).character === "number"
      ) {
        this.start = new Position(startOrLine.line, startOrLine.character);
        this.end = new Position(
          startCharacterOrEnd.line,
          startCharacterOrEnd.character,
        );
        return;
      }

      this.start = new Position(startOrLine as number, startCharacterOrEnd as number);
      this.end = new Position(endLine ?? 0, endCharacter ?? 0);
    }
  }

  class WorkspaceEdit {
    readonly entries: Array<{
      range: Range;
      uri: string;
    }> = [];

    delete(uri: { fsPath: string }, range: Range): void {
      this.entries.push({
        uri: uri.fsPath,
        range,
      });
    }
  }

  class CodeAction {
    command?: {
      command: string;
      title: string;
    };
    diagnostics?: unknown[];
    edit?: WorkspaceEdit;

    constructor(
      public readonly title: string,
      public readonly kind?: unknown,
    ) {}
  }

  class CodeActionKind {
    static readonly QuickFix = new CodeActionKind("quickfix");

    constructor(public readonly value: string) {}
  }

  return {
    CodeAction,
    CodeActionKind,
    Position,
    Range,
    WorkspaceEdit,
  };
});

import {
  CLEAR_DIAGNOSTICS_COMMAND,
  createDiagnosticCodeActions,
  REFRESH_ANALYSIS_COMMAND,
  REMOVE_ALL_UNUSED_SELECTORS_TITLE,
  REMOVE_UNUSED_CLASS_RULE_TITLE,
  REMOVE_UNUSED_CLASS_SELECTOR_TITLE,
} from "../src/code-actions.js";
import { RECSS_DIAGNOSTIC_CODE } from "../src/diagnostics.js";

function createMockDocument(content: string) {
  const lines = content.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;

  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  return {
    getText(): string {
      return content;
    },
    lineAt(line: number) {
      const text = lines[line] ?? "";
      return {
        range: {
          end: {
            character: text.length,
            line,
          },
          start: {
            character: 0,
            line,
          },
        },
        text,
      };
    },
    offsetAt(position: { character: number; line: number }): number {
      return (lineOffsets[position.line] ?? 0) + position.character;
    },
    positionAt(targetOffset: number) {
      let line = 0;

      for (let index = 0; index < lineOffsets.length; index += 1) {
        const lineStart = lineOffsets[index] ?? 0;
        const nextLineStart = lineOffsets[index + 1] ?? content.length + 1;
        if (targetOffset < nextLineStart) {
          line = index;
          return {
            character: targetOffset - lineStart,
            line,
          };
        }
      }

      const lastLine = Math.max(lines.length - 1, 0);
      const lastOffset = lineOffsets[lastLine] ?? 0;
      return {
        character: targetOffset - lastOffset,
        line: lastLine,
      };
    },
    uri: {
      fsPath: "/workspace/app-a/src/styles/card.scss",
    },
  };
}

describe("createDiagnosticCodeActions", () => {
  it("should provide remove, refresh and clear actions for simple recss diagnostics", () => {
    const actions = createDiagnosticCodeActions(
      createMockDocument(".card {\n  color: red;\n}\n") as never,
      {
        diagnostics: [
          {
            code: RECSS_DIAGNOSTIC_CODE,
            data: {
              className: "card",
              selector: ".card",
            },
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
      } as never,
    );

    expect(actions).toHaveLength(3);
    expect(actions[0]).toMatchObject({
      title: REMOVE_UNUSED_CLASS_RULE_TITLE,
    });
    expect(actions[1]).toMatchObject({
      title: "ReCSS: Refresh Analysis",
      command: {
        command: REFRESH_ANALYSIS_COMMAND,
        title: "ReCSS: Refresh Analysis",
      },
    });
    expect(actions[2]).toMatchObject({
      title: "ReCSS: Clear Diagnostics",
      command: {
        command: CLEAR_DIAGNOSTICS_COMMAND,
        title: "ReCSS: Clear Diagnostics",
      },
    });
    expect(actions[0]?.edit?.entries).toEqual([
      {
        range: {
          end: {
            character: 0,
            line: 3,
          },
          start: {
            character: 0,
            line: 0,
          },
        },
        uri: "/workspace/app-a/src/styles/card.scss",
      },
    ]);
  });

  it("should skip the remove action for non-simple selectors", () => {
    const actions = createDiagnosticCodeActions(
      createMockDocument(".card:hover {\n  color: red;\n}\n") as never,
      {
        diagnostics: [
          {
            code: RECSS_DIAGNOSTIC_CODE,
            data: {
              className: "card",
              selector: ".card:hover",
            },
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
      } as never,
    );

    expect(actions).toHaveLength(2);
    expect(actions.map((action) => action.title)).toEqual([
      "ReCSS: Refresh Analysis",
      "ReCSS: Clear Diagnostics",
    ]);
  });

  it("should remove only the unused selector from selector lists", () => {
    const actions = createDiagnosticCodeActions(
      createMockDocument(".card, .card-title {\n  color: red;\n}\n") as never,
      {
        diagnostics: [
          {
            code: RECSS_DIAGNOSTIC_CODE,
            data: {
              className: "card",
              selector: ".card",
            },
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
      } as never,
    );

    expect(actions).toHaveLength(3);
    expect(actions[0]).toMatchObject({
      title: REMOVE_UNUSED_CLASS_SELECTOR_TITLE,
    });
    expect(actions[0]?.edit?.entries).toEqual([
      {
        range: {
          end: {
            character: 7,
            line: 0,
          },
          start: {
            character: 0,
            line: 0,
          },
        },
        uri: "/workspace/app-a/src/styles/card.scss",
      },
    ]);
  });

  it("should provide a bulk remove action for non-overlapping selectors", () => {
    const actions = createDiagnosticCodeActions(
      createMockDocument(
        [
          ".card {",
          "  color: red;",
          "}",
          ".card-title {",
          "  color: blue;",
          "}",
          "",
        ].join("\n"),
      ) as never,
      {
        diagnostics: [
          {
            code: RECSS_DIAGNOSTIC_CODE,
            data: {
              className: "card",
              selector: ".card",
            },
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
          {
            code: RECSS_DIAGNOSTIC_CODE,
            data: {
              className: "card-title",
              selector: ".card-title",
            },
            message: 'Unused CSS class ".card-title" is not referenced.',
            range: {
              end: {
                character: 11,
                line: 3,
              },
              start: {
                character: 0,
                line: 3,
              },
            },
            severity: 1,
            source: "recss",
          },
        ],
      } as never,
    );

    expect(actions).toHaveLength(4);
    expect(actions[1]).toMatchObject({
      title: REMOVE_ALL_UNUSED_SELECTORS_TITLE,
    });
    expect(actions[1]?.edit?.entries).toEqual([
      {
        range: {
          end: {
            character: 0,
            line: 6,
          },
          start: {
            character: 0,
            line: 3,
          },
        },
        uri: "/workspace/app-a/src/styles/card.scss",
      },
      {
        range: {
          end: {
            character: 0,
            line: 3,
          },
          start: {
            character: 0,
            line: 0,
          },
        },
        uri: "/workspace/app-a/src/styles/card.scss",
      },
    ]);
  });

  it("should remove the whole rule when all selector list entries are unused", () => {
    const actions = createDiagnosticCodeActions(
      createMockDocument(".card, .card-title {\n  color: red;\n}\n") as never,
      {
        diagnostics: [
          {
            code: RECSS_DIAGNOSTIC_CODE,
            data: {
              className: "card",
              selector: ".card",
            },
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
          {
            code: RECSS_DIAGNOSTIC_CODE,
            data: {
              className: "card-title",
              selector: ".card-title",
            },
            message: 'Unused CSS class ".card-title" is not referenced.',
            range: {
              end: {
                character: 18,
                line: 0,
              },
              start: {
                character: 7,
                line: 0,
              },
            },
            severity: 1,
            source: "recss",
          },
        ],
      } as never,
    );

    expect(actions.map((action) => action.title)).toEqual([
      REMOVE_UNUSED_CLASS_SELECTOR_TITLE,
      REMOVE_ALL_UNUSED_SELECTORS_TITLE,
      "ReCSS: Refresh Analysis",
      "ReCSS: Clear Diagnostics",
    ]);
    expect(actions[1]?.edit?.entries).toEqual([
      {
        range: {
          end: {
            character: 0,
            line: 3,
          },
          start: {
            character: 0,
            line: 0,
          },
        },
        uri: "/workspace/app-a/src/styles/card.scss",
      },
    ]);
  });

  it("should skip the bulk remove action when overlapping selector removals are partial", () => {
    const actions = createDiagnosticCodeActions(
      createMockDocument(
        ".card, .card-title, .card-footer {\n  color: red;\n}\n",
      ) as never,
      {
        diagnostics: [
          {
            code: RECSS_DIAGNOSTIC_CODE,
            data: {
              className: "card",
              selector: ".card",
            },
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
          {
            code: RECSS_DIAGNOSTIC_CODE,
            data: {
              className: "card-title",
              selector: ".card-title",
            },
            message: 'Unused CSS class ".card-title" is not referenced.',
            range: {
              end: {
                character: 18,
                line: 0,
              },
              start: {
                character: 7,
                line: 0,
              },
            },
            severity: 1,
            source: "recss",
          },
        ],
      } as never,
    );

    expect(actions.map((action) => action.title)).toEqual([
      REMOVE_UNUSED_CLASS_SELECTOR_TITLE,
      "ReCSS: Refresh Analysis",
      "ReCSS: Clear Diagnostics",
    ]);
  });

  it("should ignore diagnostics from other sources", () => {
    const actions = createDiagnosticCodeActions(
      createMockDocument(".card {\n  color: red;\n}\n") as never,
      {
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
      } as never,
    );

    expect(actions).toEqual([]);
  });
});
