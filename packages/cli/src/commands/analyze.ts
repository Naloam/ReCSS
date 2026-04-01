import { defineCommand } from "citty";
import {
  analyzeProject,
  loadConfig,
  renderConsoleReport,
  renderJsonReport,
  type AnalysisResult,
  type RecssFramework,
} from "@recss/core";
import { resolve } from "node:path";

const supportedFrameworks = ["auto", "vue", "react", "html"] as const;
const supportedOutputs = ["console", "json"] as const;

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
      description: "Output format: console or json.",
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
  },
  async run({ args }): Promise<void> {
    const directory = typeof args.dir === "string" ? args.dir : ".";
    const configPath = typeof args.config === "string" ? args.config : undefined;
    const config = await loadConfig(directory, configPath);

    const framework =
      typeof args.framework === "string" && isAnalyzeFramework(args.framework)
        ? args.framework
        : config.framework;
    const output =
      typeof args.output === "string" && isAnalyzeOutput(args.output)
        ? args.output
        : config.report.format;

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

    writeReport(output, analysisRoot, result);

    if (result.unused.stats.unusedClasses > 0) {
      process.exitCode = 1;
    }
  },
});

function writeReport(
  output: AnalyzeOutput,
  root: string,
  result: AnalysisResult,
): void {
  if (output === "json") {
    process.stdout.write(`${renderJsonReport(result)}\n`);
    return;
  }

  process.stdout.write(`${renderConsoleReport(root, result)}\n`);
}
