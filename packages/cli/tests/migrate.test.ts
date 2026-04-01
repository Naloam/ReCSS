import { describe, expect, it, vi } from "vitest";

const buildMigrationSuggestionsMock = vi.hoisted(() => vi.fn());
const applyMigrationSuggestionsMock = vi.hoisted(() => vi.fn());

vi.mock("@recss/core", () => {
  return {
    buildMigrationSuggestions: buildMigrationSuggestionsMock,
    applyMigrationSuggestions: applyMigrationSuggestionsMock,
  };
});

import { migrateCommand } from "../src/commands/migrate.js";

describe("migrateCommand", () => {
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
});
