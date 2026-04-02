import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyMigrationSuggestions,
  buildMigrationSuggestions,
  collectStyleFiles,
  extractClassNames,
} from "../../src/migrate/index.js";

describe("migrate helpers", () => {
  it("should extract class names from css", () => {
    const names = extractClassNames(
      ".card { display: block; } .card-title { color: red; }",
    );

    expect(names).toEqual(["card", "card-title"]);
  });

  it("should collect non-module style files and build suggestions", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-core-migrate-"));

    try {
      await mkdir(resolve(root, "src"), { recursive: true });
      await writeFile(resolve(root, "src/card.scss"), ".card { color: red; }");
      await writeFile(resolve(root, "src/button.module.scss"), ".btn {}");

      const files = await collectStyleFiles(root);
      expect(files.some((file) => file.endsWith("card.scss"))).toBe(true);
      expect(files.some((file) => file.endsWith("button.module.scss"))).toBe(
        false,
      );

      const suggestions = await buildMigrationSuggestions(root);
      expect(suggestions).toHaveLength(1);
      expect(
        suggestions[0]?.suggestedModuleFile.endsWith("card.module.scss"),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("should apply migration and rewrite react className literals", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-core-migrate-apply-"));

    try {
      await mkdir(resolve(root, "src/components"), { recursive: true });
      await writeFile(
        resolve(root, "src/components/card.scss"),
        ".card { color: red; }\n.card-title { color: blue; }",
        "utf8",
      );
      await writeFile(
        resolve(root, "src/components/Card.tsx"),
        'import "./card.scss";\nexport const Card = () => <div className="card card-title" />;\n',
        "utf8",
      );

      const suggestions = await buildMigrationSuggestions(root);
      const result = await applyMigrationSuggestions(root, suggestions);

      expect(result.copiedFiles).toBe(1);
      expect(result.updatedSourceFiles).toBe(1);

      const rewritten = await readFile(
        resolve(root, "src/components/Card.tsx"),
        "utf8",
      );
      expect(rewritten).toContain('import styles from "./card.module.scss";');
      expect(rewritten).toContain(
        'className={[styles.card, styles["card-title"]].join(" ")}',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("should rewrite react template literals with mapped classes", async () => {
    const root = await mkdtemp(
      resolve(tmpdir(), "recss-core-migrate-template-"),
    );

    try {
      await mkdir(resolve(root, "src/components"), { recursive: true });
      await writeFile(
        resolve(root, "src/components/card.scss"),
        ".card { color: red; }\n.active { color: blue; }",
        "utf8",
      );
      await writeFile(
        resolve(root, "src/components/Card.tsx"),
        [
          'import "./card.scss";',
          "export const Card = ({ active }: { active: boolean }) =>",
          '  <div className={`card ${active ? "active" : ""}`} />;',
          "",
        ].join("\n"),
        "utf8",
      );

      const suggestions = await buildMigrationSuggestions(root);
      await applyMigrationSuggestions(root, suggestions);

      const rewritten = await readFile(
        resolve(root, "src/components/Card.tsx"),
        "utf8",
      );
      expect(rewritten).toContain('import styles from "./card.module.scss";');
      expect(rewritten).toContain(
        'className={`${styles.card} ${active ? styles.active : ""}`}',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("should rewrite clsx helper arguments with mapped classes", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-core-migrate-clsx-"));

    try {
      await mkdir(resolve(root, "src/components"), { recursive: true });
      await writeFile(
        resolve(root, "src/components/card.scss"),
        [
          ".card { color: red; }",
          '.card-title { color: blue; }',
          ".card-footer { color: green; }",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        resolve(root, "src/components/Card.tsx"),
        [
          'import clsx from "clsx";',
          'import "./card.scss";',
          "export const Card = ({ highlighted, active }: Props) =>",
          '  <div className={clsx("card", { "card-title": highlighted }, active && "card-footer")} />;',
          "",
        ].join("\n"),
        "utf8",
      );

      const suggestions = await buildMigrationSuggestions(root);
      await applyMigrationSuggestions(root, suggestions);

      const rewritten = await readFile(
        resolve(root, "src/components/Card.tsx"),
        "utf8",
      );
      expect(rewritten).toContain('import styles from "./card.module.scss";');
      expect(rewritten).toContain(
        'className={clsx(styles.card, { [styles["card-title"]]: highlighted }, active && styles["card-footer"])}',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("should rewrite array filter join className chains", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-core-migrate-join-"));

    try {
      await mkdir(resolve(root, "src/components"), { recursive: true });
      await writeFile(
        resolve(root, "src/components/card.scss"),
        ".card { color: red; }\n.active { color: blue; }",
        "utf8",
      );
      await writeFile(
        resolve(root, "src/components/Card.tsx"),
        [
          'import "./card.scss";',
          "export const Card = ({ active }: { active: boolean }) =>",
          '  <div className={["card", active && "active"].filter(Boolean).join(" ")} />;',
          "",
        ].join("\n"),
        "utf8",
      );

      const suggestions = await buildMigrationSuggestions(root);
      await applyMigrationSuggestions(root, suggestions);

      const rewritten = await readFile(
        resolve(root, "src/components/Card.tsx"),
        "utf8",
      );
      expect(rewritten).toContain('import styles from "./card.module.scss";');
      expect(rewritten).toContain(
        'className={[styles.card, active && styles.active].filter(Boolean).join(" ")}',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("should normalize direct array className expressions into strings", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-core-migrate-array-"));

    try {
      await mkdir(resolve(root, "src/components"), { recursive: true });
      await writeFile(
        resolve(root, "src/components/card.scss"),
        ".card { color: red; }\n.active { color: blue; }",
        "utf8",
      );
      await writeFile(
        resolve(root, "src/components/Card.tsx"),
        [
          'import "./card.scss";',
          "export const Card = ({ active }: { active: boolean }) =>",
          '  <div className={["card", active && "active"]} />;',
          "",
        ].join("\n"),
        "utf8",
      );

      const suggestions = await buildMigrationSuggestions(root);
      await applyMigrationSuggestions(root, suggestions);

      const rewritten = await readFile(
        resolve(root, "src/components/Card.tsx"),
        "utf8",
      );
      expect(rewritten).toContain('import styles from "./card.module.scss";');
      expect(rewritten).toContain(
        'className={[styles.card, active && styles.active].filter(Boolean).join(" ")}',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("should rewrite vue template classes when module style src is present", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "recss-core-migrate-vue-"));

    try {
      await mkdir(resolve(root, "src/components"), { recursive: true });
      await writeFile(
        resolve(root, "src/components/card.scss"),
        [
          ".card { color: red; }",
          ".card-body { color: blue; }",
          ".active { color: green; }",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        resolve(root, "src/components/Card.vue"),
        [
          "<template>",
          '  <section class="card">',
          '    <div class="card-body" :class="{ active: isActive }" />',
          '    <footer :class="dynamicClass" />',
          "  </section>",
          "</template>",
          "",
          '<script setup lang="ts">',
          "const isActive = true;",
          'const dynamicClass = "runtime-generated";',
          "</script>",
          "",
          '<style src="./card.scss"></style>',
          "",
        ].join("\n"),
        "utf8",
      );

      const suggestions = await buildMigrationSuggestions(root);
      await applyMigrationSuggestions(root, suggestions);

      const rewritten = await readFile(
        resolve(root, "src/components/Card.vue"),
        "utf8",
      );
      expect(rewritten).toContain(
        '<style module src="./card.module.scss"></style>',
      );
      expect(rewritten).toContain('<section :class="$style.card">');
      expect(rewritten).toContain(
        `<div :class='[$style["card-body"], { [$style.active]: isActive }]' />`,
      );
      expect(rewritten).toContain('<footer :class="dynamicClass" />');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
