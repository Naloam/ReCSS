import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockUri = {
  fsPath: string;
  toString(): string;
};

type MockWorkspaceFolder = {
  name: string;
  uri: MockUri;
};

const mockModules = vi.hoisted(() => {
  let workspaceFolders: readonly MockWorkspaceFolder[] | undefined = [];
  let saveListener:
    | ((document: {
        uri: MockUri;
      }) => unknown)
    | undefined;
  let configurationListener:
    | ((event: {
        affectsConfiguration(section: string): boolean;
      }) => unknown)
    | undefined;
  let workspaceFoldersListener:
    | ((event: {
        added?: readonly MockWorkspaceFolder[];
        removed?: readonly MockWorkspaceFolder[];
      }) => unknown)
    | undefined;
  let codeActionProvider:
    | {
        provideCodeActions: (
          document: { uri: MockUri },
          range: Range,
          context: {
            diagnostics: readonly Diagnostic[];
          },
        ) => unknown;
      }
    | undefined;

  const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
  const diagnosticCollection = {
    clear: vi.fn(),
    delete: vi.fn(),
    dispose: vi.fn(),
    set: vi.fn(),
  };
  const outputChannel = {
    appendLine: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };

  class Range {
    constructor(
      public readonly startLine: number,
      public readonly startCharacter: number,
      public readonly endLine: number,
      public readonly endCharacter: number,
    ) {}
  }

  class Diagnostic {
    code?: string | number;
    source?: string;

    constructor(
      public readonly range: Range,
      public readonly message: string,
      public readonly severity = 1,
    ) {}
  }

  class CodeActionKind {
    static readonly QuickFix = new CodeActionKind("quickfix");

    constructor(public readonly value: string) {}
  }

  class CodeAction {
    command?: {
      command: string;
      title: string;
    };
    diagnostics?: Diagnostic[];

    constructor(
      public readonly title: string,
      public readonly kind?: CodeActionKind,
    ) {}
  }

  const createUri = (path: string): MockUri => ({
    fsPath: path,
    toString: () => `file://${path}`,
  });

  return {
    core: {
      analyzeProject: vi.fn(),
      loadConfig: vi.fn(),
    },
    diagnostics: {
      createDiagnosticRecords: vi.fn(),
    },
    state: {
      createUri,
      diagnosticCollection,
      emitConfigurationChange(affectsRecss: boolean): void {
        configurationListener?.({
          affectsConfiguration: (section: string) =>
            affectsRecss && section === "recss",
        });
      },
      emitSave(filePath: string): void {
        saveListener?.({
          uri: createUri(filePath),
        });
      },
      emitWorkspaceFoldersChange(event: {
        added?: readonly MockWorkspaceFolder[];
        removed?: readonly MockWorkspaceFolder[];
      }): void {
        workspaceFoldersListener?.(event);
      },
      getCodeActions(diagnostics: readonly Diagnostic[]): CodeAction[] {
        if (!codeActionProvider) {
          throw new Error("Missing code action provider");
        }

        return (codeActionProvider.provideCodeActions(
          { uri: createUri("/workspace/app-a/src/styles/card.scss") },
          new Range(0, 0, 0, 5),
          { diagnostics },
        ) ?? []) as CodeAction[];
      },
      getOutputLines(): string[] {
        return outputChannel.appendLine.mock.calls.map(([value]) => value);
      },
      outputChannel,
      registeredCommands,
      reset(): void {
        workspaceFolders = [];
        saveListener = undefined;
        configurationListener = undefined;
        workspaceFoldersListener = undefined;
        codeActionProvider = undefined;
        registeredCommands.clear();
        diagnosticCollection.clear.mockClear();
        diagnosticCollection.delete.mockClear();
        diagnosticCollection.dispose.mockClear();
        diagnosticCollection.set.mockClear();
        outputChannel.appendLine.mockClear();
        outputChannel.clear.mockClear();
        outputChannel.dispose.mockClear();
      },
      runCommand(command: string): void {
        const handler = registeredCommands.get(command);

        if (!handler) {
          throw new Error(`Missing command: ${command}`);
        }

        handler();
      },
      setWorkspaceFolders(folders: readonly MockWorkspaceFolder[] | undefined): void {
        workspaceFolders = folders;
      },
      workspaceFolder(name: string, path: string): MockWorkspaceFolder {
        return {
          name,
          uri: createUri(path),
        };
      },
    },
    vscode: {
      commands: {
        registerCommand: vi.fn(
          (command: string, callback: (...args: unknown[]) => unknown) => {
            registeredCommands.set(command, callback);
            return {
              dispose: vi.fn(),
            };
          },
        ),
      },
      CodeAction,
      CodeActionKind,
      Diagnostic,
      DiagnosticSeverity: {
        Warning: 1,
      },
      languages: {
        createDiagnosticCollection: vi.fn(() => diagnosticCollection),
        registerCodeActionsProvider: vi.fn(
          (
            _selector: unknown,
            provider: {
              provideCodeActions: (
                document: { uri: MockUri },
                range: Range,
                context: {
                  diagnostics: readonly Diagnostic[];
                },
              ) => unknown;
            },
          ) => {
            codeActionProvider = provider;
            return {
              dispose: vi.fn(),
            };
          },
        ),
      },
      Range,
      Uri: {
        file: createUri,
      },
      window: {
        createOutputChannel: vi.fn(() => outputChannel),
      },
      workspace: {
        getConfiguration: vi.fn(() => ({
          get<T>(_section: string, defaultValue: T): T {
            return defaultValue;
          },
        })),
        getWorkspaceFolder: vi.fn((uri: MockUri) =>
          workspaceFolders?.find((folder) => uri.fsPath.startsWith(folder.uri.fsPath)),
        ),
        onDidChangeConfiguration: vi.fn(
          (
            listener: (event: {
              affectsConfiguration(section: string): boolean;
            }) => unknown,
          ) => {
            configurationListener = listener;
            return {
              dispose: vi.fn(),
            };
          },
        ),
        onDidChangeWorkspaceFolders: vi.fn(
          (
            listener: (event: {
              added?: readonly MockWorkspaceFolder[];
              removed?: readonly MockWorkspaceFolder[];
            }) => unknown,
          ) => {
            workspaceFoldersListener = listener;
            return {
              dispose: vi.fn(),
            };
          },
        ),
        onDidSaveTextDocument: vi.fn(
          (listener: (document: { uri: MockUri }) => unknown) => {
            saveListener = listener;
            return {
              dispose: vi.fn(),
            };
          },
        ),
        get workspaceFolders(): readonly MockWorkspaceFolder[] | undefined {
          return workspaceFolders;
        },
      },
    },
  };
});

vi.mock("@recss/core", () => ({
  analyzeProject: mockModules.core.analyzeProject,
  loadConfig: mockModules.core.loadConfig,
}));

vi.mock("../src/diagnostics.js", () => ({
  RECSS_DIAGNOSTIC_CODE: "unused-class",
  createDiagnosticRecords: mockModules.diagnostics.createDiagnosticRecords,
}));

vi.mock("vscode", () => mockModules.vscode);

describe("activate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockModules.state.reset();
    mockModules.core.loadConfig.mockReset();
    mockModules.core.analyzeProject.mockReset();
    mockModules.diagnostics.createDiagnosticRecords.mockReset();
    mockModules.core.loadConfig.mockResolvedValue(createExtensionConfig());
    mockModules.core.analyzeProject.mockResolvedValue(createAnalysisResult());
    mockModules.diagnostics.createDiagnosticRecords.mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("should refresh only the saved workspace folder when a relevant file changes", async () => {
    const folderA = mockModules.state.workspaceFolder("app-a", "/workspace/app-a");
    const folderB = mockModules.state.workspaceFolder("app-b", "/workspace/app-b");

    mockModules.state.setWorkspaceFolders([folderA, folderB]);

    const { activate } = await import("../src/extension.js");
    activate({
      subscriptions: [],
    });

    await vi.runAllTimersAsync();

    expect(mockModules.core.loadConfig).toHaveBeenCalledTimes(2);

    mockModules.core.loadConfig.mockClear();
    mockModules.core.analyzeProject.mockClear();
    mockModules.diagnostics.createDiagnosticRecords.mockClear();

    mockModules.state.emitSave("/workspace/app-a/src/App.vue");
    await vi.runAllTimersAsync();

    expect(mockModules.core.loadConfig).toHaveBeenCalledTimes(1);
    expect(mockModules.core.loadConfig).toHaveBeenCalledWith("/workspace/app-a");
    expect(mockModules.core.analyzeProject).toHaveBeenCalledTimes(1);
    expect(mockModules.diagnostics.createDiagnosticRecords).toHaveBeenCalledTimes(1);
    expect(mockModules.state.getOutputLines().at(-1)).toBe(
      "[recss] Refresh completed (save:App.vue): 1 workspace folder refreshed. 0 unused classes across 0 files.",
    );
  });

  it("should isolate per-folder failures and keep the successful refresh summary", async () => {
    const folderA = mockModules.state.workspaceFolder("app-a", "/workspace/app-a");
    const folderB = mockModules.state.workspaceFolder("app-b", "/workspace/app-b");

    mockModules.state.setWorkspaceFolders([folderA, folderB]);
    mockModules.core.analyzeProject.mockImplementation(
      async ({ root }: { root: string }) => {
        if (root.startsWith("/workspace/app-b")) {
          throw new Error("broken analysis");
        }

        return createAnalysisResult();
      },
    );

    const { activate } = await import("../src/extension.js");
    activate({
      subscriptions: [],
    });

    await vi.runAllTimersAsync();

    expect(mockModules.state.getOutputLines()).toEqual([
      "[recss] app-b: analysis failed (activation): broken analysis",
      "[recss] Refresh completed (activation): 1 workspace folder refreshed, 1 failed. 0 unused classes across 0 files.",
    ]);
  });

  it("should register a clear diagnostics command", async () => {
    mockModules.state.setWorkspaceFolders([
      mockModules.state.workspaceFolder("app-a", "/workspace/app-a"),
    ]);

    const { activate } = await import("../src/extension.js");
    activate({
      subscriptions: [],
    });

    mockModules.state.runCommand("recss.clearDiagnostics");

    expect(mockModules.state.diagnosticCollection.clear).toHaveBeenCalledTimes(1);
    expect(mockModules.state.getOutputLines().at(-1)).toBe(
      "[recss] Cleared all diagnostics.",
    );
  });

  it("should provide quick fixes for recss diagnostics", async () => {
    mockModules.state.setWorkspaceFolders([
      mockModules.state.workspaceFolder("app-a", "/workspace/app-a"),
    ]);

    const { activate } = await import("../src/extension.js");
    activate({
      subscriptions: [],
    });

    const diagnostic = new mockModules.vscode.Diagnostic(
      new mockModules.vscode.Range(0, 0, 0, 5),
      'Unused CSS class ".card" is not referenced.',
      mockModules.vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.code = "unused-class";
    diagnostic.source = "recss";

    const actions = mockModules.state.getCodeActions([diagnostic]);

    expect(actions.map((action) => action.title)).toEqual([
      "ReCSS: Refresh Analysis",
      "ReCSS: Clear Diagnostics",
    ]);
    expect(actions.map((action) => action.command?.command)).toEqual([
      "recss.refreshAnalysis",
      "recss.clearDiagnostics",
    ]);
  });
});

function createAnalysisResult() {
  return {
    unused: {
      skipped: [],
      stats: {
        safelistedClasses: 0,
        totalCssClasses: 0,
        uncertainClasses: 0,
        unusedClasses: 0,
        usedClasses: 0,
      },
      unused: [],
    },
  };
}

function createExtensionConfig() {
  return {
    css: {
      exclude: [],
      include: [],
    },
    framework: "auto",
    root: ".",
    safelist: [],
    sources: {
      exclude: [],
      include: [],
    },
  };
}
