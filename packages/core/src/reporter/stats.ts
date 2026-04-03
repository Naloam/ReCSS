import type { UnusedAnalysisResult } from "../types.js";

type DisplayStats = {
  totalCssClasses: number;
  referencedClasses: number;
  usedCssClasses: number;
  unusedClasses: number;
  uncertainReferences: number;
  uncertainCssClasses: number;
  safelistedClasses: number;
};

export function getDisplayStats(
  stats: UnusedAnalysisResult["stats"],
): DisplayStats {
  const referencedClasses = stats.referencedClasses ?? stats.usedClasses;
  const uncertainReferences =
    stats.uncertainReferences ?? stats.uncertainClasses;
  const uncertainCssClasses = stats.uncertainCssClasses ?? 0;
  const usedCssClasses =
    stats.usedCssClasses ??
    Math.max(
      0,
      stats.totalCssClasses -
        stats.unusedClasses -
        uncertainCssClasses -
        stats.safelistedClasses,
    );

  return {
    totalCssClasses: stats.totalCssClasses,
    referencedClasses,
    usedCssClasses,
    unusedClasses: stats.unusedClasses,
    uncertainReferences,
    uncertainCssClasses,
    safelistedClasses: stats.safelistedClasses,
  };
}
