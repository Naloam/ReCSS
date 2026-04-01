import { defineCommand } from "citty";
import {
  analyzeProject,
  loadConfig,
  renderConsoleReport,
  renderHtmlReport,
  renderMarkdownReport,
  renderJsonReport,
  type AnalysisResult,
  type RecssFramework,
} from "@recss/core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const supportedFrameworks = ["auto", "vue", "react", "html"] as const;
const supportedOutputs = ["console", "json", "html", "markdown"] as const;

type AnalyzeFramework = (typeof supportedFrameworks)[number];
type AnalyzeOutput = (typeof supportedOutputs)[number];

function isAnalyzeFramework(value: string): value is AnalyzeFramework {
  return supportedFrameworks.includes(value as AnalyzeFramework);
}

function isAnalyzeOutput(value: string): value is AnalyzeOutput {
  return supportedOutputs.includes(value as AnalyzeOutput);
}

export const analyzeCommand = defineCommand({
  meta: {
    name: "analyze",
    description: "Run the Phase 1 unused-class analysis scaffold.",
  },
  args: {
    dir: {
      type: "positional",
      default: ".",
      description: "Directory to analyze.",
      required: false,
    },
    framework: {
      type: "string",
      description: "Target framework: auto, vue, react, or html.",
    },
    output: {
      type: "string",
      description: "Output format: console, json, html, or markdown.",
    },
    config: {
      type: "string",
      required: false,
      description: "Path to config file.",
    },
    safelist: {
      type: "string",
      required: false,
      description: "Comma-separated class names to skip as unused.",
    },
    outfile: {
      type: "string",
      required: false,
      description: "Write report to file path.",
    },
  },
  async run({ args }): Promise<void> {
    const directory = typeof args.dir === "string" ? args.dir : ".";
    const configPath =
      typeof args.config === "string" ? args.config : undefined;
    const config = await loadConfig(directory, configPath);

    const framework =
      typeof args.framework === "string" && isAnalyzeFramework(args.framework)
        ? args.framework
        : config.framework;
    const output =
      typeof args.output === "string" && isAnalyzeOutput(args.output)
        ? args.output
        : config.report.format;
    const outfile =
      typeof args.outfile === "string" && args.outfile.trim().length > 0
        ? args.outfile
        : config.report.outfile;

    const cliSafelist =
      typeof args.safelist === "string"
        ? args.safelist
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : undefined;

    const analysisRoot = resolve(directory, config.root);

    const result = await analyzeProject({
      root: analysisRoot,
      framework: framework as RecssFramework,
      safelist: cliSafelist ?? config.safelist,
      cssInclude: config.css.include,
      cssExclude: config.css.exclude,
      sourceInclude: config.sources.include,
      sourceExclude: config.sources.exclude,
    });

    await writeReport(output, analysisRoot, directory, outfile, result);

    if (result.unused.stats.unusedClasses > 0) {
      process.exitCode = 1;
    }
  },
});

async function writeReport(
  output: AnalyzeOutput,
  root: string,
  directory: string,
  outfile: string | undefined,
  result: AnalysisResult,
): Promise<void> {
  if (output === "html") {
    const html = renderHtmlReport(root, result);
    const htmlPath = resolve(directory, outfile ?? "recss-report.html");
    await writeOutputFile(htmlPath, html);
    process.stdout.write(`HTML report written to ${htmlPath}\n`);
    return;
  }

  if (output === "json") {
    const json = `${renderJsonReport(result)}\n`;
    if (outfile) {
      const outputPath = resolve(directory, outfile);
      await writeOutputFile(outputPath, json);
      process.stdout.write(`JSON report written to ${outputPath}\n`);
      return;
    }

    process.stdout.write(json);
    return;
  }

  if (output === "markdown") {
    const markdown = `${renderMarkdownReport(root, result)}\n`;
    if (outfile) {
      const outputPath = resolve(directory, outfile);
      await writeOutputFile(outputPath, markdown);
      process.stdout.write(`Markdown report written to ${outputPath}\n`);
      return;
    }

    process.stdout.write(markdown);
    return;
  }

  const text = `${renderConsoleReport(root, result)}\n`;
  if (outfile) {
    const outputPath = resolve(directory, outfile);
    await writeOutputFile(outputPath, text);
    process.stdout.write(`Console report written to ${outputPath}\n`);
    return;
  }

  process.stdout.write(text);
}

async function writeOutputFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
