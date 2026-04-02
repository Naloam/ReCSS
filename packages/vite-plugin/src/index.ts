type RecssFramework = "auto" | "vue" | "react" | "html";

type Logger = {
  warn(message: string): void;
  error(message: string): void;
};

type DevServer = {
  config: {
    root: string;
    logger: Logger;
  };
};

type HotUpdateContext = {
  file: string;
  server: DevServer;
};

type RecssPlugin = {
  name: string;
  apply: "serve";
  enforce: "post";
  handleHotUpdate(ctx: HotUpdateContext): Promise<void>;
};

export type RecssVitePluginOptions = {
  framework?: RecssFramework;
  failOnUnused?: boolean;
};

const TRIGGER_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".vue",
  ".jsx",
  ".tsx",
  ".html",
]);

function shouldTrigger(file: string): boolean {
  for (const ext of TRIGGER_EXTENSIONS) {
    if (file.endsWith(ext)) {
      return true;
    }
  }

  return false;
}

async function runAnalysis(
  server: DevServer,
  options: RecssVitePluginOptions,
): Promise<void> {
  const { analyzeProject } = await import("@recss/core");
  const result = await analyzeProject({
    root: server.config.root,
    framework: options.framework ?? "auto",
  });

  const unusedCount = result.unused.stats.unusedClasses;
  if (unusedCount === 0) {
    return;
  }

  const message = `[recss] detected ${unusedCount} unused classes during HMR.`;
  if (options.failOnUnused) {
    server.config.logger.error(message);
    return;
  }

  server.config.logger.warn(message);
}

export function recssVitePlugin(
  options: RecssVitePluginOptions = {},
): RecssPlugin {
  let running = false;

  return {
    name: "recss-vite-plugin",
    apply: "serve",
    enforce: "post",
    async handleHotUpdate(ctx: HotUpdateContext): Promise<void> {
      if (running || !shouldTrigger(ctx.file)) {
        return;
      }

      running = true;
      try {
        await runAnalysis(ctx.server, options);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        ctx.server.config.logger.warn(`[recss] analysis failed: ${reason}`);
      } finally {
        running = false;
      }
    },
  };
}

export default recssVitePlugin;
