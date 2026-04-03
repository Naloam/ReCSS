import { basename, resolve } from "node:path";

import {
  analyzeProject,
  loadConfig,
  type RecssFramework,
} from "@recss/core";
import * as vscode from "vscode";

import {
  CLEAR_DIAGNOSTICS_COMMAND,
  createDiagnosticCodeActions,
  RECSS_FIX_ALL_UNUSED_SELECTORS_KIND,
  REFRESH_ANALYSIS_COMMAND,
} from "./code-actions.js";
import { createDiagnosticRecords } from "./diagnostics.js";
import {
  createRefreshRequest,
  formatAnalysisFailureMessage,
  formatClearDiagnosticsMessage,
  formatNoWorkspaceMessage,
  formatRefreshSummary,
  isRelevantRefreshPath,
  mergeRefreshRequests,
  resolveRefreshTargets,
  summarizeRefreshResults,
  type RefreshRequest,
  type WorkspaceRefreshResult,
} from "./refresh.js";

const DIAGNOSTIC_COLLECTION_NAME = "recss";
const OUTPUT_CHANNEL_NAME = "ReCSS";
const REFRESH_DEBOUNCE_MS = 150;
const FILE_CODE_ACTION_SELECTOR = {
  scheme: "file",
};

type FrameworkSetting = "config" | RecssFramework;

type ExtensionSettings = {
  enabled: boolean;
  framework: FrameworkSetting;
  runOnSave: boolean;
};

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(
    DIAGNOSTIC_COLLECTION_NAME,
  );
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const folderDiagnostics = new Map<string, string[]>();
  let refreshTimer: NodeJS.Timeout | undefined;
  let running = false;
  let pendingRequest: RefreshRequest | undefined;
  let queuedRequest: RefreshRequest | undefined;

  const clearAllDiagnostics = (): void => {
    diagnostics.clear();
    folderDiagnostics.clear();
  };

  const scheduleRefresh = (request: RefreshRequest): void => {
    pendingRequest = pendingRequest
      ? mergeRefreshRequests(pendingRequest, request)
      : request;

    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;

      const nextRequest = pendingRequest;
      pendingRequest = undefined;

      if (nextRequest) {
        void refreshWorkspaces(nextRequest);
      }
    }, REFRESH_DEBOUNCE_MS);
  };

  const clearScheduledRefreshes = (): void => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }

    pendingRequest = undefined;
    queuedRequest = undefined;
  };

  const refreshWorkspaces = async (request: RefreshRequest): Promise<void> => {
    if (running) {
      queuedRequest = queuedRequest
        ? mergeRefreshRequests(queuedRequest, request)
        : request;
      return;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      clearAllDiagnostics();
      output.appendLine(formatNoWorkspaceMessage(request.reason));
      return;
    }

    const requestedFolderKeys = resolveRefreshTargets(
      request,
      folders.map((folder) => folder.uri.toString()),
    );
    const requestedFolderSet = new Set(requestedFolderKeys);
    const targetFolders = folders.filter((folder) =>
      requestedFolderSet.has(folder.uri.toString()),
    );

    if (targetFolders.length === 0) {
      return;
    }

    running = true;

    try {
      const results = await Promise.all(
        targetFolders.map(async (folder): Promise<WorkspaceRefreshResult> => {
          try {
            return await refreshWorkspaceFolder(
              folder,
              diagnostics,
              folderDiagnostics,
            );
          } catch (error) {
            output.appendLine(
              formatAnalysisFailureMessage(folder.name, request.reason, error),
            );
            return {
              status: "failed",
            };
          }
        }),
      );

      output.appendLine(
        formatRefreshSummary(summarizeRefreshResults(request.reason, results)),
      );
    } finally {
      running = false;

      if (queuedRequest) {
        const nextRequest = queuedRequest;
        queuedRequest = undefined;
        scheduleRefresh(nextRequest);
      }
    }
  };

  context.subscriptions.push(
    diagnostics,
    output,
    vscode.languages.registerCodeActionsProvider(
      FILE_CODE_ACTION_SELECTOR,
      {
        provideCodeActions(document, _range, context) {
          return createDiagnosticCodeActions(document, context);
        },
      },
      {
        providedCodeActionKinds: [
          vscode.CodeActionKind.QuickFix,
          RECSS_FIX_ALL_UNUSED_SELECTORS_KIND,
        ],
      },
    ),
    vscode.commands.registerCommand(REFRESH_ANALYSIS_COMMAND, () => {
      scheduleRefresh(createRefreshRequest("manual-command"));
    }),
    vscode.commands.registerCommand(CLEAR_DIAGNOSTICS_COMMAND, () => {
      clearScheduledRefreshes();
      clearAllDiagnostics();
      output.appendLine(formatClearDiagnosticsMessage());
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      const folder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!folder) {
        return;
      }

      const settings = getSettings(folder);
      if (!settings.enabled || !settings.runOnSave) {
        return;
      }

      if (!isRelevantRefreshPath(document.uri.fsPath)) {
        return;
      }

      scheduleRefresh(
        createRefreshRequest(
          `save:${basename(document.uri.fsPath)}`,
          folder.uri.toString(),
        ),
      );
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("recss")) {
        scheduleRefresh(createRefreshRequest("configuration-change"));
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      for (const folder of event.removed ?? []) {
        clearFolderDiagnostics(folder.uri.toString(), diagnostics, folderDiagnostics);
      }

      scheduleRefresh(createRefreshRequest("workspace-change"));
    }),
    {
      dispose(): void {
        clearScheduledRefreshes();
      },
    },
  );

  scheduleRefresh(createRefreshRequest("activation"));
}

export function deactivate(): void {}

async function refreshWorkspaceFolder(
  folder: vscode.WorkspaceFolder,
  diagnostics: vscode.DiagnosticCollection,
  folderDiagnostics: Map<string, string[]>,
): Promise<WorkspaceRefreshResult> {
  const settings = getSettings(folder);
  const folderKey = folder.uri.toString();

  clearFolderDiagnostics(folderKey, diagnostics, folderDiagnostics);

  if (!settings.enabled) {
    return {
      status: "skipped",
    };
  }

  const config = await loadConfig(folder.uri.fsPath);
  const framework =
    settings.framework === "config" ? config.framework : settings.framework;
  const analysisRoot = resolve(folder.uri.fsPath, config.root);
  const result = await analyzeProject({
    root: analysisRoot,
    framework,
    safelist: config.safelist,
    cssInclude: config.css.include,
    cssExclude: config.css.exclude,
    sourceInclude: config.sources.include,
    sourceExclude: config.sources.exclude,
  });
  const diagnosticsByFile = await createDiagnosticRecords(result);
  const filesWithDiagnostics = [...diagnosticsByFile.keys()];

  for (const [file, records] of diagnosticsByFile) {
    const uri = vscode.Uri.file(file);
    diagnostics.set(
      uri,
      records.map((record) => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(
            record.line,
            record.startColumn,
            record.line,
            record.endColumn,
          ),
          record.message,
          vscode.DiagnosticSeverity.Warning,
        );

        diagnostic.code = record.code;
        diagnostic.data = {
          className: record.className,
          selector: record.selector,
        };
        diagnostic.source = record.source;
        return diagnostic;
      }),
    );
  }

  folderDiagnostics.set(folderKey, filesWithDiagnostics);

  return {
    status: "refreshed",
    filesWithDiagnostics: filesWithDiagnostics.length,
    unusedClasses: result.unused.stats.unusedClasses,
  };
}

function clearFolderDiagnostics(
  folderKey: string,
  diagnostics: vscode.DiagnosticCollection,
  folderDiagnostics: Map<string, string[]>,
): void {
  const files = folderDiagnostics.get(folderKey) ?? [];

  for (const file of files) {
    diagnostics.delete(vscode.Uri.file(file));
  }

  folderDiagnostics.delete(folderKey);
}

function getSettings(folder: vscode.WorkspaceFolder): ExtensionSettings {
  const config = vscode.workspace.getConfiguration("recss", folder);

  return {
    enabled: config.get<boolean>("enabled", true),
    framework: config.get<FrameworkSetting>("framework", "config"),
    runOnSave: config.get<boolean>("runOnSave", true),
  };
}
