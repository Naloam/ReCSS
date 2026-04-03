import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { defineCommand } from "citty";

const CONFIG_TEMPLATE = `import { defineConfig } from "recss-cli";

export default defineConfig({
  root: ".",
  css: {
    include: ["src/**/*.{css,scss}"],
    exclude: ["src/**/*.module.{css,scss}"],
  },
  sources: {
    include: ["src/**/*.{vue,tsx,jsx,ts,js,html}"],
    exclude: ["src/**/*.test.*", "src/**/*.spec.*"],
  },
  framework: "auto",
  safelist: [/^js-/, /^is-/, "active", "disabled"],
  report: {
    format: "console",
    outfile: "./recss-report.json",
    minUnusedThreshold: 0,
  },
});
`;

async function shouldOverwrite(filePath: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      `recss.config.ts already exists at ${filePath}. Overwrite? (y/N) `,
    );
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Create a recss.config.ts template in current directory.",
  },
  args: {
    dir: {
      type: "positional",
      default: ".",
      required: false,
      description: "Directory to initialize.",
    },
  },
  async run({ args }): Promise<void> {
    const directory = typeof args.dir === "string" ? args.dir : ".";
    const targetPath = resolve(directory, "recss.config.ts");

    if (existsSync(targetPath)) {
      const overwrite = await shouldOverwrite(targetPath);
      if (!overwrite) {
        process.stdout.write("Skipped: existing config preserved.\n");
        return;
      }
    }

    await writeFile(targetPath, CONFIG_TEMPLATE, "utf8");
    process.stdout.write(`Created ${targetPath}\n`);
  },
});
