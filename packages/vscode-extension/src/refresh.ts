import { basename, extname } from "node:path";

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

export type RefreshTargets = "all" | readonly string[];

export type RefreshRequest = {
  reason: string;
  targets: RefreshTargets;
};

export type WorkspaceRefreshResult =
  | {
      status: "failed";
    }
  | {
      status: "refreshed";
      filesWithDiagnostics: number;
      unusedClasses: number;
    }
  | {
      status: "skipped";
    };

export type RefreshSummary = {
  failedFolders: number;
  filesWithDiagnostics: number;
  reason: string;
  refreshedFolders: number;
  skippedFolders: number;
  totalUnusedClasses: number;
};

export function createRefreshRequest(
  reason: string,
  folderKey?: string,
): RefreshRequest {
  return {
    reason,
    targets: folderKey ? [folderKey] : "all",
  };
}

export function mergeRefreshRequests(
  current: RefreshRequest,
  next: RefreshRequest,
): RefreshRequest {
  return {
    reason: next.reason,
    targets: mergeRefreshTargets(current.targets, next.targets),
  };
}

export function resolveRefreshTargets(
  request: RefreshRequest,
  workspaceFolderKeys: readonly string[],
): string[] {
  if (request.targets === "all") {
    return [...workspaceFolderKeys];
  }

  const availableKeys = new Set(workspaceFolderKeys);

  return request.targets.filter((folderKey) => availableKeys.has(folderKey));
}

export function summarizeRefreshResults(
  reason: string,
  results: readonly WorkspaceRefreshResult[],
): RefreshSummary {
  return results.reduce<RefreshSummary>(
    (summary, result) => {
      if (result.status === "failed") {
        summary.failedFolders += 1;
        return summary;
      }

      if (result.status === "skipped") {
        summary.skippedFolders += 1;
        return summary;
      }

      summary.refreshedFolders += 1;
      summary.totalUnusedClasses += result.unusedClasses;
      summary.filesWithDiagnostics += result.filesWithDiagnostics;
      return summary;
    },
    {
      reason,
      refreshedFolders: 0,
      skippedFolders: 0,
      failedFolders: 0,
      totalUnusedClasses: 0,
      filesWithDiagnostics: 0,
    },
  );
}

export function formatAnalysisFailureMessage(
  folderName: string,
  reason: string,
  error: unknown,
): string {
  const message = error instanceof Error ? error.message : String(error);
  return `[recss] ${folderName}: analysis failed (${reason}): ${message}`;
}

export function formatClearDiagnosticsMessage(): string {
  return "[recss] Cleared all diagnostics.";
}

export function formatNoWorkspaceMessage(reason: string): string {
  return `[recss] Skipped refresh (${reason}): no workspace folders are open.`;
}

export function formatRefreshSummary(summary: RefreshSummary): string {
  const statusParts = [
    `${summary.refreshedFolders} ${pluralize(
      "workspace folder",
      summary.refreshedFolders,
    )} refreshed`,
  ];

  if (summary.skippedFolders > 0) {
    statusParts.push(`${summary.skippedFolders} skipped`);
  }

  if (summary.failedFolders > 0) {
    statusParts.push(`${summary.failedFolders} failed`);
  }

  const metrics =
    summary.refreshedFolders > 0
      ? ` ${summary.totalUnusedClasses} unused ${pluralize(
          "class",
          summary.totalUnusedClasses,
        )} across ${summary.filesWithDiagnostics} ${pluralize(
          "file",
          summary.filesWithDiagnostics,
        )}.`
      : "";

  return `[recss] Refresh completed (${summary.reason}): ${statusParts.join(
    ", ",
  )}.${metrics}`;
}

export function isRelevantRefreshPath(filePath: string): boolean {
  if (RELEVANT_CONFIG_FILES.has(basename(filePath))) {
    return true;
  }

  return RELEVANT_EXTENSIONS.has(extname(filePath));
}

function mergeRefreshTargets(
  current: RefreshTargets,
  next: RefreshTargets,
): RefreshTargets {
  if (current === "all" || next === "all") {
    return "all";
  }

  return [...new Set([...current, ...next])];
}

function pluralize(value: string, count: number): string {
  if (value === "class") {
    return count === 1 ? value : "classes";
  }

  return count === 1 ? value : `${value}s`;
}
