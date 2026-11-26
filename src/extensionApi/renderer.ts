/**
 * Extension API for the UI half of an extension.
 *
 * The renderer entry exports `activate(api)` and, optionally, `deactivate()`.
 * Every `add...` call returns a disposer and is also tracked by the host:
 * when the extension is disabled or uninstalled, everything it added is
 * removed. `activate` may return an object for dependants to read with
 * `api.extensions.getExports(id)`.
 */
import type React from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type * as monaco from 'monaco-editor';
import type { EditorTabState } from '../types/editor';
import type {
  FileOpenCloseEvent,
  FileSaveReason,
  FileWillSaveEvent,
  FileWillSaveParticipant,
} from '../extensionHost/renderer/documents.renderer';
import type { Project, SettingsType } from '../types/backend';
import type {
  Disposable,
  ExtensionConnectionDescriptor,
  ExtensionDescription,
  ExtensionLogger,
  FileDidSaveEvent,
} from './shared';
import type {
  ConnectionFormProps,
  ConnectionUi,
} from '../connections/core/ui.renderer';
import type {
  FileViewDefinition,
  FileViewProps,
} from '../renderer/components/fileViews/types';
import type {
  TerminalPanelContext,
  TerminalPanelDefinition,
  TerminalPanelState,
} from '../renderer/components/terminal/panels/types';

export type { ConnectionFormProps, ConnectionUi };

/**
 * A database an extension adds, UI side: its facts (`descriptor`, the same
 * as in the main half) and how it looks. `ui.icon` is an image URL;
 * `ui.Form` is the add / edit form (without one the database has no tile on
 * the add screen); `ui.sqlEditorInput` and `ui.listDetails` are optional.
 */
export interface ExtensionConnectionUi {
  descriptor: ExtensionConnectionDescriptor;
  ui: Omit<ConnectionUi<any>, 'type'>;
}

export type {
  EditorTabState,
  FileOpenCloseEvent,
  FileSaveReason,
  FileWillSaveEvent,
  FileWillSaveParticipant,
  FileViewDefinition,
  FileViewProps,
  TerminalPanelContext,
  TerminalPanelDefinition,
  TerminalPanelState,
};
export {
  Slot,
  useSlot,
  useWorkspaceTabs,
} from '../extensionHost/renderer/contributions.renderer';
export { createExtensionIpc } from '../extensionHost/renderer/extensionIpc.renderer';
export type { ExtensionIpc } from '../extensionHost/renderer/extensionIpc.renderer';

/** An entry in the activity bar on the left. */
export interface NavigationItem {
  id: string;
  /** Route the item opens, for example `/app/sql`. */
  path: string;
  label: string;
  /** One line shown in the command palette. */
  description: string;
  icon: React.ComponentType<any>;
  testId?: string;
  /** `main` is the top group, `bottom` the group pinned to the bottom. */
  area?: 'main' | 'bottom';
  /** Position inside its area, lowest first. */
  order?: number;
  /**
   * Routes that show this item as the active one: the route itself and
   * anything below it. Defaults to `[path]`.
   */
  activePaths?: string[];
  /** Active only on exactly `path`, not on routes below it. */
  exact?: boolean;
  /** Greyed out when this returns false. */
  isEnabled?: (state: { hasProject: boolean }) => boolean;
  /**
   * A hook that returns where the item navigates to, when that is not always
   * `path` (for example "the page last visited in this area").
   */
  useTargetPath?: () => string;
}

/** A page under `/app`. */
export interface ScreenDefinition {
  id: string;
  /** Route paths relative to `/app`, for example `sql` or `notes/:id`. */
  paths: string[];
  Component: React.ComponentType;
  /** Relative paths that redirect to an absolute route. */
  redirects?: Array<{ from: string; to: string }>;
  /** Show the AI assistant button in the top bar on this screen. */
  assistant?: boolean;
}

/** A component placed into a named slot of an existing screen. */
export interface SlotContribution<P = any> {
  id: string;
  order?: number;
  Component: React.ComponentType<P>;
  /** Shown only when this returns true for the slot's props. */
  when?: (props: P) => boolean;
}

export interface DashboardCardContext {
  navigate: NavigateFunction;
  /** Opens the side panel, as the built-in cards do before navigating. */
  openSidebar: () => void;
  hasProjects: boolean;
}

/** A card on the Home screen. */
export interface DashboardCard {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: React.ComponentType<any>;
  order?: number;
  /** Route opened on click. Ignored when `onSelect` is given. */
  path?: string;
  onSelect?: (context: DashboardCardContext) => void;
}

/** What a breadcrumb-bar action knows about the file shown in the editor. */
export interface EditorActionContext {
  /** The open file: `path`, `content`, `isModified`, ... */
  tab: EditorTabState;
  projectId?: string;
  projectPath: string;
  /** Monaco language id of the file, e.g. `sql`, `python`, `markdown`. */
  language: string;
}

/**
 * A button (or anything small) in the bar above the code editor, next to
 * the file's breadcrumb: "Run", "Preview", "Format".
 */
export interface EditorAction {
  id: string;
  order?: number;
  when: (context: EditorActionContext) => boolean;
  Component: React.ComponentType<EditorActionContext>;
}

/** One row of the project file tree, as row contributions see it. */
export interface FileTreeRow {
  /** Absolute path of the file or folder. */
  path: string;
  name: string;
  isFolder: boolean;
  /** Absolute path of the project the tree shows. */
  projectPath: string;
  /** Git status of the row, when it has uncommitted changes. */
  gitStatus?: string;
}

/** A button (or anything small) at the right end of matching tree rows. */
export interface FileTreeRowAction {
  id: string;
  order?: number;
  when: (row: FileTreeRow) => boolean;
  /** Renders the action; return null to show nothing for this row. */
  Component: React.ComponentType<FileTreeRow>;
}

/** What shows when the pointer rests on the name of a matching tree row. */
export interface FileTreeHoverPreview {
  id: string;
  when: (row: FileTreeRow) => boolean;
  Component: React.ComponentType<FileTreeRow>;
}

export interface ProjectMenuContext {
  project: Project;
  settings?: SettingsType;
}

/** An entry in the run menu of the project screen's top bar. */
export interface ProjectMenuItem {
  id: string;
  order?: number;
  name: string;
  subTitle: string;
  icon: React.ComponentType;
  /** Shown only when Studio runs things on this machine. */
  localOnly?: boolean;
  /** Shown only when Studio runs things on Rosetta Cloud. */
  cloudOnly?: boolean;
  dividerBefore?: boolean;
  onSelect: (context: ProjectMenuContext) => void;
}

/** What a workspace tab's two parts get from the screen that hosts it. */
export interface WorkspaceTabProps<S = unknown> {
  /** The connection the screen is working on; null while none is picked. */
  connectionId: string | null;
  /** Name to show for the connection, when the screen knows one. */
  connectionName?: string;
  /**
   * What the tab keeps while the screen is open (for example the page that
   * is open). Shared by `Sidebar` and `Main`; reset to null when the
   * connection changes.
   */
  state: S | null;
  setState: (state: S | null) => void;
  /**
   * Call after the tab changed what the connection contains (created or
   * dropped a table), so the screen reloads its Data tree. Not every
   * screen gives one.
   */
  onSchemaChange?: () => void;
}

/**
 * A tab added to a screen that works on one connection (the SQL Editor,
 * Notebooks):
 * an entry in the screen's side panel tabs, what the side panel shows for
 * it, and what the main area shows while it is selected.
 */
export interface WorkspaceTab<S = any> {
  id: string;
  order?: number;
  label: string;
  icon: React.ComponentType<any>;
  Sidebar: React.ComponentType<WorkspaceTabProps<S>>;
  Main: React.ComponentType<WorkspaceTabProps<S>>;
  /** The AI assistant to use while this tab is selected. */
  assistant?: (state: S | null) => { screenKey: string; pageId?: string };
}

/** Screens that accept workspace tabs. */
export const STUDIO_WORKSPACES = {
  sql: 'sql',
  notebooks: 'notebooks',
} as const;

/** Slots Studio's own screens offer. Props are what each contribution gets. */
export const STUDIO_SLOTS = {
  /** Under the file tree of the project screen. Props: `{ project }`. */
  projectExplorerFooter: 'project.explorer.footer',
  /**
   * Always mounted while the project screen is open; for dialogs. Props:
   * `{ project }`.
   */
  projectOverlays: 'project.overlays',
  /** Always mounted while Home is open; for dialogs. No props. */
  homeOverlays: 'home.overlays',
} as const;

/** A page in Settings, reachable at `/app/settings/<id>`. */
export interface SettingsPage {
  /** Url segment; must not clash with a built-in page. */
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<any>;
  /** Group heading in the Settings side list. Defaults to `Extensions`. */
  category?: string;
  order?: number;
  Component: React.ComponentType;
}

/**
 * A React provider mounted around the whole app. Adding or removing one
 * remounts the app, so an extension that needs one should set
 * `requiresRestart` in its manifest.
 */
export interface AppProvider {
  id: string;
  order?: number;
  Component: React.ComponentType<{ children: React.ReactNode }>;
}

export interface CommandDefinition {
  id: string;
  label: string;
  run: () => void | Promise<void>;
  /** Can be run by id but is not listed in the command palette. */
  hidden?: boolean;
}

export interface ExtensionRendererApi {
  readonly extension: ExtensionDescription;
  /** Disposed, last added first, when the extension is deactivated. */
  readonly subscriptions: Disposable[];
  readonly navigation: {
    addItem: (item: NavigationItem) => Disposable;
  };
  readonly screens: {
    add: (screen: ScreenDefinition) => Disposable;
  };
  readonly workspaceTabs: {
    /** `screenId` is one of `STUDIO_WORKSPACES`. */
    add: (screenId: string, tab: WorkspaceTab) => Disposable;
  };
  readonly connections: {
    /**
     * Adds the UI of a database: its tile and form on the add-connection
     * screen, its icon and label in lists. The main half adds how to reach
     * it with its own `api.connections.register`. A type that is already
     * taken is refused.
     */
    register: (connection: ExtensionConnectionUi) => Disposable;
  };
  readonly slots: {
    /** Slot ids are published by the screen that owns the slot. */
    add: (slotId: string, contribution: SlotContribution) => Disposable;
  };
  readonly dashboard: {
    addCard: (card: DashboardCard) => Disposable;
  };
  readonly settings: {
    addPage: (page: SettingsPage) => Disposable;
  };
  readonly app: {
    addProvider: (provider: AppProvider) => Disposable;
  };
  readonly fileViews: {
    /**
     * Takes over how matching files are shown in the project editor. The
     * view with the highest `priority` whose `matches` accepts the tab wins.
     */
    add: (view: FileViewDefinition<any>) => Disposable;
  };
  readonly editor: {
    /** Adds a button to the bar above the code editor for matching files. */
    addAction: (action: EditorAction) => Disposable;
  };
  /**
   * The Monaco namespace all of Studio's editors share. Languages,
   * completion, formatting and hover providers registered on it apply to
   * every editor; each `register...` call returns a disposable, which the
   * extension pushes onto `api.subscriptions`.
   */
  readonly monaco: typeof monaco;
  readonly files: {
    /**
     * Runs before a project file is written. Return a string to change what
     * is written (a formatter); return nothing to leave it. A participant
     * that throws or takes longer than 3 s is skipped and the save goes on.
     */
    onWillSave: (participant: FileWillSaveParticipant) => Disposable;
    /** Runs after a project file was written, by the editor or by an agent. */
    onDidSave: (listener: (event: FileDidSaveEvent) => void) => Disposable;
    /** Runs when a file is opened in the project editor. */
    onDidOpen: (listener: (event: FileOpenCloseEvent) => void) => Disposable;
    /** Runs when a file's editor tab is closed. */
    onDidClose: (listener: (event: FileOpenCloseEvent) => void) => Disposable;
  };
  readonly fileTree: {
    addRowAction: (action: FileTreeRowAction) => Disposable;
    addHoverPreview: (preview: FileTreeHoverPreview) => Disposable;
  };
  readonly projectMenu: {
    addItem: (item: ProjectMenuItem) => Disposable;
  };
  readonly panels: {
    /** A tab in the bottom panel of the project screen. */
    add: (panel: TerminalPanelDefinition) => Disposable;
  };
  readonly commands: {
    /** A command in the command palette (Ctrl/Cmd+Shift+P). */
    add: (command: CommandDefinition) => Disposable;
  };
  readonly ipc: {
    /** Calls a handler the main half registered with `api.ipc.handle`. */
    invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
    /** Listens to events the main half sends with `api.ipc.send`. */
    on: (channel: string, listener: (payload: any) => void) => Disposable;
  };
  readonly bridge: {
    /** Answers `api.bridge.request(operation, payload)` from the main half. */
    handle: (
      operation: string,
      handler: (payload: any) => unknown | Promise<unknown>,
    ) => Disposable;
  };
  readonly extensions: {
    /** What another extension's renderer `activate` returned. */
    getExports: <T = unknown>(extensionId: string) => T | undefined;
  };
  /** Small values kept in the window's local storage, private to the extension. */
  readonly storage: {
    get: <T = unknown>(key: string) => T | undefined;
    set: (key: string, value: unknown) => void;
    remove: (key: string) => void;
  };
  readonly log: ExtensionLogger;
}

export interface ExtensionRendererModule {
  activate: (api: ExtensionRendererApi) => unknown | Promise<unknown>;
  deactivate?: () => void | Promise<void>;
}
