const GENERATED_DIRECTORY_NAMES = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".vercel",
  ".vscode",
] as const;

const GENERATED_DIRECTORY_SET = new Set<string>(GENERATED_DIRECTORY_NAMES);

export const GENERATED_DIRECTORY_GLOBS = GENERATED_DIRECTORY_NAMES.map(
  (name) => `**/${name}/**`,
);

export function appendGeneratedDirectoryExcludes(
  patterns: string[],
): string[] {
  return [...new Set([...patterns, ...GENERATED_DIRECTORY_GLOBS])];
}

export function shouldSkipGeneratedDirectory(name: string): boolean {
  return GENERATED_DIRECTORY_SET.has(name);
}
