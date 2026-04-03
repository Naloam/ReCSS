import * as cssTree from "css-tree";

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

function getSelectorVariant(selector: string, className: string): string {
  try {
    const parsed = cssTree.parse(selector, {
      context: "selector",
    }) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("children" in parsed) ||
      !parsed.children ||
      typeof parsed.children !== "object" ||
      !(Symbol.iterator in parsed.children)
    ) {
      return selector;
    }

    const currentCompound: string[] = [];
    let compoundHasTarget = false;
    let targetCompound: string[] | null = null;

    for (const node of parsed.children as Iterable<cssTree.CssNode>) {
      if (node.type === "Combinator") {
        if (compoundHasTarget) {
          targetCompound = [...currentCompound];
        }
        currentCompound.length = 0;
        compoundHasTarget = false;
        continue;
      }

      currentCompound.push(cssTree.generate(node));
      if (node.type === "ClassSelector" && node.name === className) {
        compoundHasTarget = true;
      }
    }

    if (compoundHasTarget) {
      targetCompound = [...currentCompound];
    }

    return targetCompound?.join("") ?? selector;
  } catch {
    return selector;
  }
}

function groupEntriesBySelectorVariant(
  definitions: ClassDefinition[],
  property: string,
): SpecificityConflictEntry[][] {
  const groups = new Map<string, SpecificityConflictEntry[]>();

  for (const definition of definitions) {
    const variantKey = getSelectorVariant(definition.selector, definition.name);
    const group = groups.get(variantKey) ?? [];
    groups.set(variantKey, group);

    for (const declaration of definition.declarations) {
      if (declaration.property !== property) {
        continue;
      }

      group.push({
        value: declaration.value,
        specificity: definition.specificity,
        file: definition.file,
        line: definition.line,
        isImportant: declaration.important,
      });
    }
  }

  return [...groups.values()]
    .map((entries) =>
      entries.sort((a, b) => compareSpecificity(a.specificity, b.specificity)),
    )
    .filter((entries) => entries.length > 0);
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
      const entryGroups = groupEntriesBySelectorVariant(definitions, property);
      for (const entries of entryGroups) {
        if (!hasConflict(entries)) {
          continue;
        }

        conflicts.push({
          className,
          property,
          definitions: entries,
        });
      }
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
