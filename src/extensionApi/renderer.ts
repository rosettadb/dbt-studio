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
import type { Project, SettingsType } from '../types/backend';
import type {
  Disposable,
  ExtensionDescription,
  ExtensionLogger,
} from './shared';
import type {
  FileViewDefinition,
  FileViewProps,
} from '../renderer/components/fileViews/types';
import type {
  TerminalPanelContext,
  TerminalPanelDefinition,
  TerminalPanelState,
} from '../renderer/components/terminal/panels/types';

export type {
  FileViewDefinition,
  FileViewProps,
  TerminalPanelContext,
  TerminalPanelDefinition,
  TerminalPanelState,
};
export {
  Slot,
  useSlot,
} from '../extensionHost/renderer/contributions.renderer';

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

/** Slots Studio's own screens offer. Props are what each contribution gets. */
export const STUDIO_SLOTS = {
  /** Under the file tree of the project screen. Props: `{ project }`. */
  projectExplorerFooter: 'project.explorer.footer',
  /**
   * Always mounted while the project screen is open; for dialogs. Props:
   * `{ project }`.
   */
  projectOverlays: 'project.overlays',
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
