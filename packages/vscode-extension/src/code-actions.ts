import * as vscode from "vscode";

import { RECSS_DIAGNOSTIC_CODE } from "./diagnostics.js";

export const REFRESH_ANALYSIS_COMMAND = "recss.refreshAnalysis";
export const CLEAR_DIAGNOSTICS_COMMAND = "recss.clearDiagnostics";

export function createDiagnosticCodeActions(
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

  return [refreshAction, clearAction];
}
