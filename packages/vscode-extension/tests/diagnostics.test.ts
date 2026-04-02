import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildDiagnosticMessage,
  createDiagnosticRecords,
  resolveDefinitionRange,
} from "../src/diagnostics.js";

import type { AnalysisResult, ClassDefinition } from "@recss/core";

describe("resolveDefinitionRange", () => {
  it("should highlight the class token when it exists on the target line", () => {
    const range = resolveDefinitionRange(".card-title { color: red; }", {
      name: "card-title",
      line: 1,
      column: 1,
      selector: ".card-title",
    });

    expect(range).toEqual({
      line: 0,
      startColumn: 0,
      endColumn: 11,
    });
  });

  it("should fall back to the selector column when the class token is missing", () => {
    const range = resolveDefinitionRange("  .card {\n}", {
      name: "ghost",
      line: 1,
      column: 3,
      selector: ".ghost",
    });

    expect(range).toEqual({
      line: 0,
      startColumn: 2,
      endColumn: 8,
    });
  });
});

describe("createDiagnosticRecords", () => {
  it("should group diagnostics by file when analysis reports unused classes", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-vscode-extension-"));

    try {
      const styleFile = resolve(root, "src/styles/card.scss");
      await mkdir(dirname(styleFile), { recursive: true });
      await writeFile(styleFile, ".card-title { color: red; }\n", "utf8");

      const diagnostics = await createDiagnosticRecords(
        createAnalysisResult([
          createDefinition({
            file: styleFile,
            name: "card-title",
            selector: ".card-title",
          }),
        ]),
      );

      expect(diagnostics.get(styleFile)).toEqual([
        {
          className: "card-title",
          code: "unused-class",
          endColumn: 11,
          file: styleFile,
          line: 0,
          message: buildDiagnosticMessage("card-title"),
          selector: ".card-title",
          source: "recss",
          startColumn: 0,
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function createAnalysisResult(definitions: ClassDefinition[]): AnalysisResult {
  return {
    unused: {
      unused: definitions.map((definition) => ({
        name: definition.name,
        definitions: [definition],
      })),
      skipped: [],
      stats: {
        totalCssClasses: definitions.length,
        usedClasses: 0,
        unusedClasses: definitions.length,
        uncertainClasses: 0,
        safelistedClasses: 0,
      },
    },
  };
}

function createDefinition(
  overrides: Partial<ClassDefinition> & Pick<ClassDefinition, "file" | "name">,
): ClassDefinition {
  return {
    name: overrides.name,
    selector: overrides.selector ?? `.${overrides.name}`,
    file: overrides.file,
    line: overrides.line ?? 1,
    column: overrides.column ?? 1,
    specificity: overrides.specificity ?? [0, 1, 0],
    properties: overrides.properties ?? ["color"],
    declarations: overrides.declarations ?? [
      {
        property: "color",
        value: "red",
        important: false,
      },
    ],
  };
}
