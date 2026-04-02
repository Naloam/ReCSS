import * as vscode from "vscode";

import { RECSS_DIAGNOSTIC_CODE } from "./diagnostics.js";

export const REFRESH_ANALYSIS_COMMAND = "recss.refreshAnalysis";
export const CLEAR_DIAGNOSTICS_COMMAND = "recss.clearDiagnostics";
export const REMOVE_UNUSED_CLASS_RULE_TITLE =
  "ReCSS: Remove Unused Class Rule";

type UnusedClassDiagnosticData = {
  className: string;
  selector: string;
};

function isUnusedClassDiagnosticData(
  value: unknown,
): value is UnusedClassDiagnosticData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    className?: unknown;
    selector?: unknown;
  };

  return (
    typeof candidate.className === "string" &&
    typeof candidate.selector === "string"
  );
}

function isSimpleClassSelector(
  data: UnusedClassDiagnosticData,
): boolean {
  return data.selector.trim() === `.${data.className}`;
}

export function resolveRuleRemovalRange(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): vscode.Range | undefined {
  const data = diagnostic.data;
  if (!isUnusedClassDiagnosticData(data) || !isSimpleClassSelector(data)) {
    return undefined;
  }

  const content = document.getText();
  const ruleStart = document.offsetAt(
    new vscode.Position(diagnostic.range.start.line, 0),
  );
  const selectorStart = document.offsetAt(diagnostic.range.start);
  const blockStart = content.indexOf("{", selectorStart);
  if (blockStart < 0) {
    return undefined;
  }

  let depth = 0;
  let blockEnd = -1;

  for (let index = blockStart; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        blockEnd = index + 1;
        break;
      }
    }
  }

  if (blockEnd < 0) {
    return undefined;
  }

  let removalEnd = blockEnd;
  while (
    removalEnd < content.length &&
    (content[removalEnd] === " " || content[removalEnd] === "\t")
  ) {
    removalEnd += 1;
  }

  if (content[removalEnd] === "\r") {
    removalEnd += 1;
  }
  if (content[removalEnd] === "\n") {
    removalEnd += 1;
  }

  return new vscode.Range(
    document.positionAt(ruleStart),
    document.positionAt(removalEnd),
  );
}

function createRemoveUnusedClassRuleAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): vscode.CodeAction | undefined {
  const range = resolveRuleRemovalRange(document, diagnostic);
  if (!range) {
    return undefined;
  }

  const action = new vscode.CodeAction(
    REMOVE_UNUSED_CLASS_RULE_TITLE,
    vscode.CodeActionKind.QuickFix,
  );
  const edit = new vscode.WorkspaceEdit();

  edit.delete(document.uri, range);
  action.edit = edit;
  action.diagnostics = [diagnostic];

  return action;
}

export function createDiagnosticCodeActions(
  document: vscode.TextDocument,
  context: vscode.CodeActionContext,
): vscode.CodeAction[] {
  const recssDiagnostics = context.diagnostics.filter(
    (diagnostic) =>
      diagnostic.source === "recss" &&
      diagnostic.code === RECSS_DIAGNOSTIC_CODE,
  );

  if (recssDiagnostics.length === 0) {
    return [];
  }

  const removeAction = createRemoveUnusedClassRuleAction(
    document,
    recssDiagnostics[0],
  );
  const refreshAction = new vscode.CodeAction(
    "ReCSS: Refresh Analysis",
    vscode.CodeActionKind.QuickFix,
  );
  refreshAction.command = {
    command: REFRESH_ANALYSIS_COMMAND,
    title: "ReCSS: Refresh Analysis",
  };
  refreshAction.diagnostics = recssDiagnostics;

  const clearAction = new vscode.CodeAction(
    "ReCSS: Clear Diagnostics",
    vscode.CodeActionKind.QuickFix,
  );
  clearAction.command = {
    command: CLEAR_DIAGNOSTICS_COMMAND,
    title: "ReCSS: Clear Diagnostics",
  };
  clearAction.diagnostics = recssDiagnostics;

  return removeAction
    ? [removeAction, refreshAction, clearAction]
    : [refreshAction, clearAction];
}
