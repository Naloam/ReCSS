import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { recssVitePlugin } from "../src/index.js";

describe("recssVitePlugin integration", () => {
  it("should run analysis on HMR update and emit warning", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-vite-integration-"));

    try {
      await mkdir(resolve(root, "src"), { recursive: true });
      await writeFile(
        resolve(root, "src/App.vue"),
        '<template><div class="btn-primary" /></template>',
        "utf8",
      );
      await writeFile(
        resolve(root, "src/style.scss"),
        ".btn-primary { color: red; }\n.btn-ghost { color: blue; }",
        "utf8",
      );

      const warn = vi.fn();
      const error = vi.fn();
      const plugin = recssVitePlugin();

      await plugin.handleHotUpdate({
        file: resolve(root, "src/style.scss"),
        server: {
          config: {
            root,
            logger: {
              warn,
              error,
            },
          },
        },
      });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain("unused classes");
      expect(error).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
