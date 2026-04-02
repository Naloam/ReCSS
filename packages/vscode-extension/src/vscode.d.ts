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
    constructor(start: Position, end: Position);
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
    data?: unknown;
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
    getText(): string;
    lineAt(line: number): {
      range: Range;
      text: string;
    };
    offsetAt(position: Position): number;
    positionAt(offset: number): Position;
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

  export interface Command {
    command: string;
    title: string;
  }

  export class CodeActionKind {
    constructor(value: string);
    static readonly QuickFix: CodeActionKind;
    readonly value: string;
  }

  export class CodeAction {
    constructor(title: string, kind?: CodeActionKind);
    command?: Command;
    diagnostics?: Diagnostic[];
    edit?: WorkspaceEdit;
    readonly kind?: CodeActionKind;
    readonly title: string;
  }

  export class WorkspaceEdit {
    delete(uri: Uri, range: Range): void;
  }

  export interface CodeActionContext {
    diagnostics: readonly Diagnostic[];
  }

  export interface CodeActionProvider {
    provideCodeActions(
      document: TextDocument,
      range: Range,
      context: CodeActionContext,
    ): CodeAction[] | Promise<CodeAction[]>;
  }

  export namespace languages {
    function createDiagnosticCollection(name?: string): DiagnosticCollection;
    function registerCodeActionsProvider(
      selector: unknown,
      provider: CodeActionProvider,
      metadata?: {
        providedCodeActionKinds?: readonly CodeActionKind[];
      },
    ): Disposable;
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
