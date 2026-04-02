import { resolve, extname, basename } from "node:path";

import {
  analyzeProject,
  loadConfig,
  type RecssFramework,
} from "@recss/core";
import * as vscode from "vscode";

import { createDiagnosticRecords } from "./diagnostics.js";

const DIAGNOSTIC_COLLECTION_NAME = "recss";
const OUTPUT_CHANNEL_NAME = "ReCSS";
const REFRESH_DEBOUNCE_MS = 150;
const RELEVANT_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".vue",
  ".tsx",
  ".jsx",
  ".html",
]);
const RELEVANT_CONFIG_FILES = new Set([
  "package.json",
  "recss.config.ts",
  "recss.config.js",
  "recss.config.mjs",
]);

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
  let queuedReason: string | undefined;

  const scheduleRefresh = (reason: string): void => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      void refreshAllWorkspaces(reason);
    }, REFRESH_DEBOUNCE_MS);
  };

  const refreshAllWorkspaces = async (reason: string): Promise<void> => {
    if (running) {
      queuedReason = reason;
      return;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      diagnostics.clear();
      folderDiagnostics.clear();
      return;
    }

    running = true;

    try {
      await Promise.all(
        folders.map((folder) =>
          refreshWorkspaceFolder(folder, diagnostics, folderDiagnostics, output),
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`[recss] analysis failed (${reason}): ${message}`);
    } finally {
      running = false;

      if (queuedReason) {
        const nextReason = queuedReason;
        queuedReason = undefined;
        scheduleRefresh(nextReason);
      }
    }
  };

  context.subscriptions.push(
    diagnostics,
    output,
    vscode.commands.registerCommand("recss.refreshAnalysis", () => {
      scheduleRefresh("manual-command");
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

      if (!shouldRefreshForPath(document.uri.fsPath)) {
        return;
      }

      scheduleRefresh(`save:${basename(document.uri.fsPath)}`);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("recss")) {
        scheduleRefresh("configuration-change");
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      scheduleRefresh("workspace-change");
    }),
    {
      dispose(): void {
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
      },
    },
  );

  scheduleRefresh("activation");
}

export function deactivate(): void {}

async function refreshWorkspaceFolder(
  folder: vscode.WorkspaceFolder,
  diagnostics: vscode.DiagnosticCollection,
  folderDiagnostics: Map<string, string[]>,
  output: vscode.OutputChannel,
): Promise<void> {
  const settings = getSettings(folder);
  const folderKey = folder.uri.toString();

  clearFolderDiagnostics(folderKey, diagnostics, folderDiagnostics);

  if (!settings.enabled) {
    return;
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
        diagnostic.source = record.source;
        return diagnostic;
      }),
    );
  }

  folderDiagnostics.set(folderKey, filesWithDiagnostics);
  output.appendLine(
    `[recss] ${folder.name}: ${result.unused.stats.unusedClasses} unused classes.`,
  );
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

function shouldRefreshForPath(filePath: string): boolean {
  if (RELEVANT_CONFIG_FILES.has(basename(filePath))) {
    return true;
  }

  return RELEVANT_EXTENSIONS.has(extname(filePath));
}
