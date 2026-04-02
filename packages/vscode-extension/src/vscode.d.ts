declare module "vscode" {
  export type Disposable = {
    dispose(): void;
  };

  export type Uri = {
    fsPath: string;
    toString(): string;
  };

  export namespace Uri {
    function file(path: string): Uri;
  }

  export class Position {
    constructor(line: number, character: number);
    readonly line: number;
    readonly character: number;
  }

  export class Range {
    constructor(
      startLine: number,
      startCharacter: number,
      endLine: number,
      endCharacter: number,
    );
    readonly start: Position;
    readonly end: Position;
  }

  export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
  }

  export class Diagnostic {
    constructor(range: Range, message: string, severity?: DiagnosticSeverity);
    code?: string | number;
    source?: string;
    readonly message: string;
    readonly range: Range;
    readonly severity: DiagnosticSeverity;
  }

  export interface DiagnosticCollection extends Disposable {
    clear(): void;
    delete(uri: Uri): void;
    set(uri: Uri, diagnostics: Diagnostic[] | undefined): void;
  }

  export interface OutputChannel extends Disposable {
    appendLine(value: string): void;
    clear(): void;
  }

  export interface WorkspaceFolder {
    name: string;
    uri: Uri;
  }

  export interface TextDocument {
    uri: Uri;
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string, defaultValue: T): T;
  }

  export interface ConfigurationChangeEvent {
    affectsConfiguration(section: string): boolean;
  }

  export type WorkspaceFoldersChangeEvent = {
    readonly added?: readonly WorkspaceFolder[];
    readonly removed?: readonly WorkspaceFolder[];
  };

  export interface ExtensionContext {
    subscriptions: Disposable[];
  }

  export namespace languages {
    function createDiagnosticCollection(name?: string): DiagnosticCollection;
  }

  export namespace window {
    function createOutputChannel(name: string): OutputChannel;
  }

  export namespace commands {
    function registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown,
    ): Disposable;
  }

  export namespace workspace {
    const workspaceFolders: readonly WorkspaceFolder[] | undefined;

    function getConfiguration(
      section?: string,
      scope?: WorkspaceFolder | Uri,
    ): WorkspaceConfiguration;
    function getWorkspaceFolder(uri: Uri): WorkspaceFolder | undefined;
    function onDidSaveTextDocument(
      listener: (document: TextDocument) => unknown,
    ): Disposable;
    function onDidChangeConfiguration(
      listener: (event: ConfigurationChangeEvent) => unknown,
    ): Disposable;
    function onDidChangeWorkspaceFolders(
      listener: (event: WorkspaceFoldersChangeEvent) => unknown,
    ): Disposable;
  }
}
