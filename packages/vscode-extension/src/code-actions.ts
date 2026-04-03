import * as vscode from "vscode";

import { RECSS_DIAGNOSTIC_CODE } from "./diagnostics.js";

export const REFRESH_ANALYSIS_COMMAND = "recss.refreshAnalysis";
export const CLEAR_DIAGNOSTICS_COMMAND = "recss.clearDiagnostics";
export const REMOVE_UNUSED_CLASS_RULE_TITLE =
  "ReCSS: Remove Unused Class Rule";
export const REMOVE_UNUSED_CLASS_SELECTOR_TITLE =
  "ReCSS: Remove Unused Class Selector";
export const REMOVE_ALL_UNUSED_SELECTORS_TITLE =
  "ReCSS: Remove All Simple Unused Selectors";

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

type SelectorSlice = {
  end: number;
  start: number;
  text: string;
};

type UnusedClassRemoval = {
  range: vscode.Range;
  title: string;
};

type ResolvedRemoval = {
  diagnostic: vscode.Diagnostic;
  endOffset: number;
  range: vscode.Range;
  startOffset: number;
};

type RuleBounds = {
  blockEnd: number;
  blockStart: number;
  content: string;
  removalEnd: number;
  ruleStart: number;
};

function splitSelectorList(selectorText: string): SelectorSlice[] {
  const selectors: SelectorSlice[] = [];
  let quote: '"' | "'" | undefined;
  let bracketDepth = 0;
  let parenDepth = 0;
  let segmentStart = 0;

  function pushSelector(segmentEnd: number): void {
    let start = segmentStart;
    let end = segmentEnd;

    while (start < end && /\s/u.test(selectorText[start] ?? "")) {
      start += 1;
    }

    while (end > start && /\s/u.test(selectorText[end - 1] ?? "")) {
      end -= 1;
    }

    if (start >= end) {
      return;
    }

    selectors.push({
      start,
      end,
      text: selectorText.slice(start, end).trim(),
    });
  }

  for (let index = 0; index < selectorText.length; index += 1) {
    const char = selectorText[index];
    const previous = selectorText[index - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      continue;
    }

    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (char === "," && bracketDepth === 0 && parenDepth === 0) {
      pushSelector(index);
      segmentStart = index + 1;
    }
  }

  pushSelector(selectorText.length);

  return selectors;
}

function resolveRuleBounds(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): RuleBounds | undefined {
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

  return {
    blockEnd,
    blockStart,
    content,
    removalEnd,
    ruleStart,
  };
}

export function resolveRuleRemovalRange(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): vscode.Range | undefined {
  const removal = resolveUnusedClassRemoval(document, diagnostic);
  return removal?.title === REMOVE_UNUSED_CLASS_RULE_TITLE
    ? removal.range
    : undefined;
}

function resolveUnusedClassRemoval(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): UnusedClassRemoval | undefined {
  const data = diagnostic.data;
  if (!isUnusedClassDiagnosticData(data) || !isSimpleClassSelector(data)) {
    return undefined;
  }

  const bounds = resolveRuleBounds(document, diagnostic);
  if (!bounds) {
    return undefined;
  }

  const selectorText = bounds.content.slice(bounds.ruleStart, bounds.blockStart);
  const selectors = splitSelectorList(selectorText);
  const selectorIndex = selectors.findIndex(
    (selector) => selector.text === data.selector.trim(),
  );
  if (selectorIndex < 0) {
    return undefined;
  }

  if (selectors.length === 1) {
    return {
      title: REMOVE_UNUSED_CLASS_RULE_TITLE,
      range: new vscode.Range(
        document.positionAt(bounds.ruleStart),
        document.positionAt(bounds.removalEnd),
      ),
    };
  }

  const target = selectors[selectorIndex];
  if (!target) {
    return undefined;
  }

  const removalStart =
    selectorIndex === 0
      ? target.start
      : (selectors[selectorIndex - 1]?.end ?? target.start);
  const removalEnd =
    selectorIndex === 0
      ? (selectors[selectorIndex + 1]?.start ?? target.end)
      : target.end;

  return {
    title: REMOVE_UNUSED_CLASS_SELECTOR_TITLE,
    range: new vscode.Range(
      document.positionAt(bounds.ruleStart + removalStart),
      document.positionAt(bounds.ruleStart + removalEnd),
    ),
  };
}

function createRemoveUnusedClassRuleAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): vscode.CodeAction | undefined {
  const removal = resolveUnusedClassRemoval(document, diagnostic);
  if (!removal) {
    return undefined;
  }

  const action = new vscode.CodeAction(
    removal.title,
    vscode.CodeActionKind.QuickFix,
  );
  const edit = new vscode.WorkspaceEdit();

  edit.delete(document.uri, removal.range);
  action.edit = edit;
  action.diagnostics = [diagnostic];

  return action;
}

function createRemoveAllUnusedSelectorsAction(
  document: vscode.TextDocument,
  diagnostics: vscode.Diagnostic[],
): vscode.CodeAction | undefined {
  const removals: ResolvedRemoval[] = [];

  for (const diagnostic of diagnostics) {
    const removal = resolveUnusedClassRemoval(document, diagnostic);
    if (!removal) {
      continue;
    }

    const startOffset = document.offsetAt(removal.range.start);
    const endOffset = document.offsetAt(removal.range.end);
    const duplicate = removals.some(
      (item) =>
        item.startOffset === startOffset && item.endOffset === endOffset,
    );
    if (duplicate) {
      continue;
    }

    removals.push({
      diagnostic,
      endOffset,
      range: removal.range,
      startOffset,
    });
  }

  if (removals.length < 2) {
    return undefined;
  }

  const sortedRemovals = [...removals].sort(
    (left, right) => left.startOffset - right.startOffset,
  );
  for (let index = 1; index < sortedRemovals.length; index += 1) {
    if (
      (sortedRemovals[index]?.startOffset ?? 0) <
      (sortedRemovals[index - 1]?.endOffset ?? 0)
    ) {
      return undefined;
    }
  }

  const action = new vscode.CodeAction(
    REMOVE_ALL_UNUSED_SELECTORS_TITLE,
    vscode.CodeActionKind.QuickFix,
  );
  const edit = new vscode.WorkspaceEdit();

  for (const removal of [...sortedRemovals].reverse()) {
    edit.delete(document.uri, removal.range);
  }

  action.edit = edit;
  action.diagnostics = sortedRemovals.map((removal) => removal.diagnostic);

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
  const removeAllAction = createRemoveAllUnusedSelectorsAction(
    document,
    recssDiagnostics,
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

  const actions: vscode.CodeAction[] = [];
  if (removeAction) {
    actions.push(removeAction);
  }
  if (removeAllAction) {
    actions.push(removeAllAction);
  }

  actions.push(refreshAction, clearAction);
  return actions;
}
