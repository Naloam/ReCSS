import type {
  ClassDefinition,
  CssParseResult,
  SpecificityAnalysisResult,
  SpecificityConflict,
  SpecificityConflictEntry,
} from "../types.js";

function compareSpecificity(
  left: [number, number, number],
  right: [number, number, number],
): number {
  if (left[0] !== right[0]) {
    return right[0] - left[0];
  }

  if (left[1] !== right[1]) {
    return right[1] - left[1];
  }

  return right[2] - left[2];
}

function collectPropertyEntries(
  definitions: ClassDefinition[],
  property: string,
): SpecificityConflictEntry[] {
  const entries: SpecificityConflictEntry[] = [];

  for (const definition of definitions) {
    for (const declaration of definition.declarations) {
      if (declaration.property !== property) {
        continue;
      }

      entries.push({
        value: declaration.value,
        specificity: definition.specificity,
        file: definition.file,
        line: definition.line,
        isImportant: declaration.important,
      });
    }
  }

  return entries.sort((a, b) =>
    compareSpecificity(a.specificity, b.specificity),
  );
}

function hasConflict(entries: SpecificityConflictEntry[]): boolean {
  if (entries.length < 2) {
    return false;
  }

  const specificityVariants = new Set(
    entries.map((entry) => entry.specificity.join(",")),
  );
  if (specificityVariants.size > 1) {
    return true;
  }

  const importantVariants = new Set(
    entries.map((entry) => String(entry.isImportant)),
  );
  return importantVariants.size > 1;
}

function collectImportantUsage(
  definitions: ClassDefinition[],
): ClassDefinition[] {
  return definitions.filter((definition) =>
    definition.declarations.some((declaration) => declaration.important),
  );
}

export function analyzeSpecificity(
  cssResult: CssParseResult,
): SpecificityAnalysisResult {
  const conflicts: SpecificityConflict[] = [];
  const importantUsage: ClassDefinition[] = [];

  for (const [className, definitions] of cssResult.entries()) {
    if (definitions.length < 2) {
      importantUsage.push(...collectImportantUsage(definitions));
      continue;
    }

    const propertySet = new Set<string>();
    for (const definition of definitions) {
      for (const declaration of definition.declarations) {
        propertySet.add(declaration.property);
      }
    }

    for (const property of propertySet) {
      const entries = collectPropertyEntries(definitions, property);
      if (!hasConflict(entries)) {
        continue;
      }

      conflicts.push({
        className,
        property,
        definitions: entries,
      });
    }

    importantUsage.push(...collectImportantUsage(definitions));
  }

  return {
    conflicts,
    importantUsage,
    stats: {
      totalConflicts: conflicts.length,
      importantCount: importantUsage.length,
    },
  };
}
