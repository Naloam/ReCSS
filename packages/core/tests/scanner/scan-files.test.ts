import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scanFiles } from "../../src/scanner/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { force: true, recursive: true })),
  );
  tempDirs.length = 0;
});

describe("scanFiles", () => {
  it("should scan and classify css and source files", async () => {
    const root = await mkdtemp(join(tmpdir(), "recss-scan-"));
    tempDirs.push(root);

    await writeFile(join(root, "a.scss"), ".a{}", "utf8");
    await writeFile(
      join(root, "Comp.vue"),
      '<template><div class="a"/></template>',
      "utf8",
    );
    await writeFile(
      join(root, "Comp.tsx"),
      'export const C = () => <div className="a" />',
      "utf8",
    );
    await writeFile(
      join(root, "Theme.ts"),
      'export function applyTheme(root: HTMLElement) { root.classList.add("a"); }',
      "utf8",
    );
    await writeFile(
      join(root, "Legacy.js"),
      'export function mount(node) { node.className = "a"; }',
      "utf8",
    );
    await writeFile(join(root, "index.html"), '<div class="a"></div>', "utf8");

    const result = await scanFiles({
      root,
      cssInclude: ["**/*.{css,scss}"],
      cssExclude: [],
      sourceInclude: ["**/*.{vue,tsx,jsx,ts,js,html}"],
      sourceExclude: [],
    });

    expect(result.cssFiles).toHaveLength(1);
    expect(result.vueFiles).toHaveLength(1);
    expect(result.jsxFiles).toHaveLength(3);
    expect(result.htmlFiles).toHaveLength(1);
  });

  it("should ignore generated directories by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "recss-scan-"));
    tempDirs.push(root);

    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(root, ".vercel", "output", "static"), {
      recursive: true,
    });

    await writeFile(join(root, "src", "app.css"), ".app{}", "utf8");
    await writeFile(
      join(root, "src", "App.tsx"),
      'export const App = () => <div className="app" />',
      "utf8",
    );
    await writeFile(join(root, "dist", "bundle.css"), ".bundle{}", "utf8");
    await writeFile(
      join(root, ".vercel", "output", "static", "index.html"),
      '<div class="bundle"></div>',
      "utf8",
    );

    const result = await scanFiles({
      root,
      cssInclude: ["**/*.{css,scss}"],
      cssExclude: [],
      sourceInclude: ["**/*.{vue,tsx,jsx,ts,js,html}"],
      sourceExclude: [],
    });

    expect(result.cssFiles).toHaveLength(1);
    expect(result.cssFiles[0]).toContain("/src/app.css");
    expect(result.jsxFiles).toHaveLength(1);
    expect(result.jsxFiles[0]).toContain("/src/App.tsx");
    expect(result.htmlFiles).toHaveLength(0);
  });
});
