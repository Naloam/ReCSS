import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const buildMigrationSuggestionsMock = vi.hoisted(() => vi.fn());
const applyMigrationSuggestionsMock = vi.hoisted(() => vi.fn());

vi.mock("@recss/core", () => {
  return {
    buildMigrationSuggestions: buildMigrationSuggestionsMock,
    applyMigrationSuggestions: applyMigrationSuggestionsMock,
  };
});

import { migrateCommand } from "../src/commands/migrate.js";

function captureStdout(fn: () => Promise<void>): string {
  const chunks: string[] = [];
  const original = process.stdout.write;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: string) => {
    chunks.push(chunk);
    return true;
  };
  return fn().then(() => {
    process.stdout.write = original;
    return chunks.join("");
  });
}

describe("migrateCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call core apply flow when --apply is true", async () => {
    buildMigrationSuggestionsMock.mockResolvedValueOnce([
      {
        file: "/workspace/src/card.scss",
        suggestedModuleFile: "/workspace/src/card.module.scss",
        classNames: ["card"],
      },
    ]);
    applyMigrationSuggestionsMock.mockResolvedValueOnce({
      copiedFiles: 1,
      updatedSourceFiles: 1,
    });

    await migrateCommand.run?.({
      args: {
        dir: "/workspace",
        apply: true,
      },
    } as never);

    expect(buildMigrationSuggestionsMock).toHaveBeenCalledWith("/workspace");
    expect(applyMigrationSuggestionsMock).toHaveBeenCalledTimes(1);
  });

  it("should not call apply when --apply is absent", async () => {
    buildMigrationSuggestionsMock.mockResolvedValueOnce([]);

    await migrateCommand.run?.({
      args: { dir: "/workspace" },
    } as never);

    expect(buildMigrationSuggestionsMock).toHaveBeenCalledWith("/workspace");
    expect(applyMigrationSuggestionsMock).not.toHaveBeenCalled();
  });

  it("should not call apply when --apply is false", async () => {
    buildMigrationSuggestionsMock.mockResolvedValueOnce([]);

    await migrateCommand.run?.({
      args: { dir: "/workspace", apply: false },
    } as never);

    expect(applyMigrationSuggestionsMock).not.toHaveBeenCalled();
  });

  it("should default dir to current working directory when not provided", async () => {
    buildMigrationSuggestionsMock.mockResolvedValueOnce([]);

    await migrateCommand.run?.({
      args: {},
    } as never);

    const calledPath = buildMigrationSuggestionsMock.mock
      .calls[0]?.[0] as string;
    expect(calledPath).toBe(resolve("."));
  });

  it("should print suggestion list for non-empty results", async () => {
    buildMigrationSuggestionsMock.mockResolvedValueOnce([
      {
        file: "/workspace/src/card.scss",
        suggestedModuleFile: "/workspace/src/card.module.scss",
        classNames: ["card", "card-title"],
      },
      {
        file: "/workspace/src/button.css",
        suggestedModuleFile: "/workspace/src/button.module.css",
        classNames: ["btn"],
      },
    ]);

    const output = await captureStdout(() =>
      migrateCommand.run?.({
        args: { dir: "/workspace" },
      } as never),
    );

    expect(output).toContain("ReCSS migrate suggestions");
    expect(output).toContain("card.scss");
    expect(output).toContain("card.module.scss");
    expect(output).toContain("card, card-title");
    expect(output).toContain("button.css");
    expect(output).toContain("btn");
  });

  it("should print no-files message when suggestions are empty", async () => {
    buildMigrationSuggestionsMock.mockResolvedValueOnce([]);

    const output = await captureStdout(() =>
      migrateCommand.run?.({
        args: { dir: "/workspace" },
      } as never),
    );

    expect(output).toContain("ReCSS migrate suggestions");
    expect(output).toContain("No non-module CSS/SCSS files found.");
  });

  it("should print apply summary when --apply succeeds", async () => {
    buildMigrationSuggestionsMock.mockResolvedValueOnce([
      {
        file: "/workspace/src/card.scss",
        suggestedModuleFile: "/workspace/src/card.module.scss",
        classNames: ["card"],
      },
    ]);
    applyMigrationSuggestionsMock.mockResolvedValueOnce({
      copiedFiles: 2,
      updatedSourceFiles: 3,
    });

    const output = await captureStdout(() =>
      migrateCommand.run?.({
        args: { dir: "/workspace", apply: true },
      } as never),
    );

    expect(output).toContain("[recss] applied migration");
    expect(output).toContain("copied 2 style files");
    expect(output).toContain("updated 3 source files");
  });

  it("should handle zero-class suggestions gracefully", async () => {
    buildMigrationSuggestionsMock.mockResolvedValueOnce([
      {
        file: "/workspace/src/empty.scss",
        suggestedModuleFile: "/workspace/src/empty.module.scss",
        classNames: [],
      },
    ]);

    const output = await captureStdout(() =>
      migrateCommand.run?.({
        args: { dir: "/workspace" },
      } as never),
    );

    expect(output).toContain("detected classes: none");
  });

  it("should pass the resolved absolute path to buildMigrationSuggestions", async () => {
    buildMigrationSuggestionsMock.mockResolvedValueOnce([]);

    await migrateCommand.run?.({
      args: { dir: "src/components" },
    } as never);

    const calledPath = buildMigrationSuggestionsMock.mock
      .calls[0]?.[0] as string;
    expect(calledPath).toBe(resolve("src/components"));
  });
});
