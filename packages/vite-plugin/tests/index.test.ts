import { describe, expect, it, vi } from "vitest";

import { recssVitePlugin } from "../src/index.js";

const analyzeProjectMock = vi.hoisted(() => vi.fn());

vi.mock("@recss/core", () => {
  return {
    analyzeProject: analyzeProjectMock,
  };
});

describe("recssVitePlugin", () => {
  it("should warn when unused classes are detected", async () => {
    analyzeProjectMock.mockResolvedValueOnce({
      unused: {
        unused: [],
        skipped: [],
        stats: {
          totalCssClasses: 3,
          usedClasses: 1,
          unusedClasses: 2,
          uncertainClasses: 0,
          safelistedClasses: 0,
        },
      },
    });

    const warn = vi.fn();
    const error = vi.fn();
    const plugin = recssVitePlugin();

    await plugin.handleHotUpdate?.({
      file: "/workspace/src/app.css",
      server: {
        config: {
          root: "/workspace",
          logger: {
            warn,
            error,
          },
        },
      },
    } as never);

    expect(analyzeProjectMock).toHaveBeenCalledWith({
      root: "/workspace",
      framework: "auto",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("should skip analysis for unsupported file types", async () => {
    analyzeProjectMock.mockReset();

    const plugin = recssVitePlugin();

    await plugin.handleHotUpdate?.({
      file: "/workspace/src/logo.svg",
      server: {
        config: {
          root: "/workspace",
          logger: {
            warn: vi.fn(),
            error: vi.fn(),
          },
        },
      },
    } as never);

    expect(analyzeProjectMock).not.toHaveBeenCalled();
  });
});
