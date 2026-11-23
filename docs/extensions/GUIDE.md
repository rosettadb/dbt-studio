# Building a Studio extension

An extension adds to Studio without changing Studio's code: a sidebar item, a screen, components inside existing screens, file handlers, bottom panels, commands, settings pages, backend handlers.

This guide covers what the extension system supports today. Sections are added as more injection points land (see `PLAN.md`).

A complete working example is in [`examples/hello`](examples/hello).

---

## 1. What an extension is

A folder with a `package.json` and up to two entry files:

```
hello/
  package.json     the manifest
  main.js          main-process half (Node), optional
  renderer.js      UI half (runs in the Studio window), optional
```

Each half exports `activate(api)` and, optionally, `deactivate()`.

- `activate(api)` registers what the extension contributes.
- Everything registered through `api` is tracked. When the extension is disabled or uninstalled, Studio removes all of it. You only clean up things you created outside `api` (timers, child processes): push a disposable onto `api.subscriptions`, or do it in `deactivate()`.
- `activate` may return an object. Extensions that depend on yours read it with `api.extensions.getExports('<your id>')`.

An extension reaches Studio **only through `api`** and the libraries Studio shares (section 5).

## 2. The manifest (`package.json`)

```json
{
  "name": "hello",
  "publisher": "studio-examples",
  "displayName": "Hello",
  "description": "Example extension.",
  "version": "1.0.0",
  "engines": { "rosettaStudio": ">=1.7.8" },
  "main": "main.js",
  "renderer": "renderer.js",
  "extensionDependencies": [],
  "requiresRestart": false
}
```

| Field | Required | Meaning |
|---|---|---|
| `name`, `publisher` | yes | Lowercase letters, digits, dashes. The id is `publisher.name`. |
| `version` | yes | `major.minor.patch` |
| `engines.rosettaStudio` | yes | Studio versions supported: `*`, `1.8.0`, `>=1.8.0`, `^1.8.0` |
| `main` | one of the two | Main-process entry, a path inside the extension |
| `renderer` | one of the two | UI entry, a path inside the extension |
| `displayName`, `description` | no | Shown on the Extensions screen |
| `extensionDependencies` | no | Ids that must be running first. Yours starts after them and stops before them. |
| `requiresRestart` | no | `true` if the extension cannot be switched on or off while Studio runs (for example because it adds an app-wide provider) |

Other fields are ignored, so the file can also hold your build scripts and dependencies.

## 3. Installing, enabling, removing

**Settings → Extensions**:

- **Install from folder** / **Install from file** (`.zip` of the folder). Studio shows the name and asks for confirmation.
- The switch enables or disables an extension. This applies immediately, unless the manifest says `requiresRestart`.
- The bin icon uninstalls.
- Replacing an extension that already ran in this session shows **Restart to apply**: code that is already loaded cannot be unloaded.

Installed extensions live in `<userData>/extensions/<id>/`. The folder button on the Extensions screen opens it.

**Trust:** an extension runs with the same access to files, connections and credentials as Studio. There is no sandbox. Install only what you trust.

A broken extension never stops Studio. It is listed as *Failed* or *Cannot start* with the reason, and everything else keeps running.

## 4. The UI half

### 4.1 What `api` offers today

| Call | Adds |
|---|---|
| `api.navigation.addItem(item)` | An item in the sidebar |
| `api.screens.add(screen)` | A page under `/app/...` |
| `api.slots.add(slotId, contribution)` | A component inside an existing screen's slot |
| `api.dashboard.addCard(card)` | A card on Home |
| `api.settings.addPage(page)` | A page in Settings |
| `api.fileViews.add(view)` | A handler for a kind of file in the project editor |
| `api.panels.add(panel)` | A tab in the bottom panel of the project screen |
| `api.fileTree.addRowAction(action)` / `api.fileTree.addHoverPreview(preview)` | A button on matching rows of the project file tree, and what shows when the pointer rests on a row |
| `api.projectMenu.addItem(item)` | An entry in the run menu of the project screen's top bar |
| `api.editor.addAction(action)` | A button in the bar above the code editor, next to the file's breadcrumb |
| `api.monaco` | The Monaco namespace all editors share: languages, autocomplete, formatting, hover |
| `api.files.onWillSave / onDidSave / onDidOpen / onDidClose` | Hooks before and after a file is saved, and when it is opened or closed |
| `api.commands.add(command)` | A command in the command palette |
| `api.app.addProvider(provider)` | A React provider around the whole app |
| `api.ipc.invoke(channel, ...args)` / `api.ipc.on(channel, listener)` | Calls to and events from your main half |
| `api.bridge.handle(operation, handler)` | An answer to `api.bridge.request` from your main half |
| `api.extensions.getExports(id)` | What another extension's `activate` returned |
| `api.storage.get / set / remove` | Small values in local storage, private to the extension |
| `api.log.info / warn / error` | Console output tagged with the extension id |

Every `add...` returns `{ dispose() }` if you want to remove something yourself before the extension stops.

The types are in `src/extensionApi/renderer.ts`.

### 4.2 Sidebar item and screen

```js
api.navigation.addItem({
  id: 'hello',
  path: '/app/hello',        // where the item goes
  label: 'Hello',
  description: 'Example extension screen',   // shown in the command palette
  icon: HelloIcon,           // a React component
  order: 750,                // position; Studio's items use 100, 200, ...
});

api.screens.add({
  id: 'hello',
  paths: ['hello'],          // relative to /app; 'notes/:id' style params work
  Component: HelloScreen,
});
```

Other `NavigationItem` fields: `area: 'bottom'` (the group at the bottom), `activePaths` (other routes that should highlight the item), `isEnabled({ hasProject })`, `testId`.

A screen renders inside `AppLayout`, which sets the side panel and the top bar for that screen:

```jsx
<AppLayout panelTitle="Hello" sidebarContent={<MySidePanel />} topMenuActions={<MyButtons />}>
  <MyContent />
</AppLayout>
```

Always use `AppLayout`; without it the previous screen's side panel stays visible.

### 4.3 Components inside an existing screen (slots)

A screen that accepts contributions renders `<Slot id="..." props={...} />` (or reads `useSlot(id)` to lay them out itself). You add to it:

```js
api.slots.add('some.slot.id', {
  id: 'my-button',
  order: 10,
  Component: MyButton,            // receives the slot's props
  when: (props) => props.isDbt,   // optional
});
```

Slot ids are published by the screen that owns them. Studio's own slots are in `STUDIO_SLOTS` (from `@rosetta/studio-api`):

| Slot | Where | Props |
|---|---|---|
| `STUDIO_SLOTS.projectExplorerFooter` | Under the file tree of the project screen | `{ project }` |
| `STUDIO_SLOTS.projectOverlays` | Always mounted while the project screen is open; for dialogs | `{ project }` |
| `STUDIO_SLOTS.homeOverlays` | Always mounted while Home is open; for dialogs | none |

**Opening a project first.** When something needs a project (the Pipelines card on Home does), send the user to the project list with a command to run afterwards:

```js
navigate('/app/select-project', {
  state: {
    afterOpen: { command: 'my.command-id', message: 'Pick the project to add this to.' },
    startNewProject: false,   // true opens the new project form straight away
  },
});
```

The list shows `message`, and the project that is picked or created opens and runs the command (registered with `api.commands.add`, `hidden: true` if it should not be in the palette).

### 4.4 File handlers

Decides which component shows an open file in the project editor.

```js
api.fileViews.add({
  id: 'my-csv',
  priority: 10,                              // higher wins; Studio's default views use 0
  matches: (tab) => tab.path.endsWith('.csv'),
  Component: CsvView,                        // receives { tab, project, ...props }
  props: { compact: true },                  // your own props, passed through
});
```

`matches` gets the tab (`path`, `content`, `isModified`, ...). The first matching view by priority wins; the code editor is the fallback. The same component can be registered more than once with different `props`.

### 4.5 File tree rows and the project run menu

```js
api.fileTree.addRowAction({
  id: 'my-run',
  order: 100,
  when: (row) => !row.isFolder && row.name.endsWith('.job.yml'),
  Component: RunButton,     // receives { path, name, isFolder, projectPath, gitStatus }
});

api.fileTree.addHoverPreview({
  id: 'my-preview',
  when: (row) => row.name.endsWith('.job.yml'),
  Component: JobPreview,    // same props; shown in a tooltip on the row's name
});

api.projectMenu.addItem({
  id: 'my-run-all',
  order: 100,
  name: 'Run all jobs',
  subTitle: 'Run every job in the project',
  icon: JobIcon,
  localOnly: true,          // or cloudOnly; omit both to always show
  dividerBefore: true,
  onSelect: ({ project, settings }) => { /* ... */ },
});
```

A row action renders its own button and may return `null` when it does not apply (for example when a tool is not installed). The run menu is the split button in the top bar of the project screen; today it is shown for dbt projects.

To open a dialog from a row button or a menu entry, keep the "what should be open" state in a small store of your own and render the dialog from a contribution to `STUDIO_SLOTS.projectOverlays`.

### 4.6 The code editor: breadcrumb buttons, language features, save hooks

**A button above the editor** ("Run", "Preview", "Format"):

```js
api.editor.addAction({
  id: 'my-run',
  order: 100,
  when: ({ language, tab }) => language === 'sql' && !tab.isReadOnly,
  Component: RunButton,     // receives { tab, projectId, projectPath, language }
});
```

The component renders its own button. `tab` is the open file (`path`, `content`, `isModified`, ...).

**Autocomplete, formatting, hover, a new language** go on the shared Monaco namespace. Each `register...` returns a disposable; push it onto `api.subscriptions` so it is removed with the extension:

```js
api.subscriptions.push(
  api.monaco.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems: (model, position) => ({ suggestions: [/* ... */] }),
  }),
  api.monaco.languages.registerDocumentFormattingEditProvider('sql', {
    provideDocumentFormattingEdits: (model) => [
      { range: model.getFullModelRange(), text: format(model.getValue()) },
    ],
  }),
);
```

Providers are global per language id: they apply to every editor that shows that language.

**Hooks around saving and opening:**

```js
// Before a file is written. Return a string to change what is written.
api.files.onWillSave(({ path, content, reason }) => {
  if (reason !== 'manual' || !path.endsWith('.sql')) return undefined;
  return format(content);
});

// After a file was written, by the editor ('user') or an AI agent ('agent').
api.files.onDidSave(({ path, source }) => { /* ... */ });

api.files.onDidOpen(({ path }) => { /* ... */ });
api.files.onDidClose(({ path }) => { /* ... */ });
```

- `reason` is `manual` (Save, Ctrl/Cmd+S, Save All, Save and close), `auto` (saved on the user's behalf, for example before a run) or `programmatic` (written by code: an applied AI edit, a restore, a new file). A formatter normally acts on `manual` only.
- Every save from the window goes through these hooks. Participants run one after the other; each sees what the previous one returned. When the content changes, the open tab is updated to what was written.
- A participant that throws, or takes longer than 3 seconds, is skipped and the file is saved anyway.
- Files written by an AI agent are written in the main process: they fire `onDidSave` but not `onWillSave`.

### 4.7 Bottom panels, commands, dashboard cards, settings pages

```js
api.panels.add({
  id: 'my-logs',
  label: 'MY LOGS',
  order: 850,                                       // Studio's panels use 100, 200, ... 900
  useState: ({ project }) => ({ visible: true }),   // a hook: visibility, and `activity` to request focus
  Component: MyLogs,                                // receives { project }
});

api.commands.add({ id: 'hello.greet', label: 'Hello: Greet', run: () => { /* ... */ } });
// `hidden: true` keeps a command out of the palette; it can still be run by id.

api.dashboard.addCard({
  id: 'hello', title: 'Hello', category: 'Example',
  description: 'Opens the Hello screen.', icon: HelloIcon, path: '/app/hello',
});

api.settings.addPage({
  id: 'hello',                 // opens at /app/settings/hello
  label: 'Hello', icon: HelloIcon, description: 'Settings of the Hello extension.',
  category: 'Extensions',      // group heading; an existing heading joins that group
  Component: HelloSettings,
});
```

## 5. Libraries Studio shares with the UI half

These must be Studio's own copies; do **not** bundle them. Mark them as externals:

`react`, `react-dom`, `react/jsx-runtime`, `@mui/material`, `@mui/material/styles`, `@emotion/react`, `@emotion/styled`, `react-router-dom`, `react-query`, `monaco-editor`, `@rosetta/studio-api`

`@rosetta/studio-api` is Studio's API module. Besides the contract helpers (`Slot`, `useSlot`, `STUDIO_SLOTS`, `toDisposable`) it carries the pieces of Studio that extensions may use, listed in `src/extensionApi/studio/`:

| Area | Exports |
|---|---|
| Layout and dialogs | `AppLayout`, `Modal`, `ConfirmationModal`, `PushToCloudModal`, `UnsavedChangesDialog`, the settings-page building blocks (`SettingsStack`, `SettingsSection`, `SettingsRow`, `SettingsStatus`, ...) |
| Editor and tabs | `Editor`, `useTabs`, `useTerminalMinimize`, `useRefreshProjectFiles` |
| Project, settings, connections | `useGetSelectedProject`, `useGetSettings`, `useGetConnectionById`, `useSetConnectionEnvVariable`, `getConnectionUi`, `projectTypeOf`, `useAppContext`, `useSecureStorage` |
| Cloud runs and tasks | `useCloudRuns`, `useCloudRunActionId`, `useActiveCloudRun`, `useCloudActionStatus`, `useCloudActionLogs`, `usePipelineActionId`, `useTaskManager`, `useTaskChannel`, `useIsTaskTypeActive` |
| Services | `projectsServices`, `settingsServices`, `getFileContent`, `getFileStatus`, `isFileUnpushed`, `secureStorageService`, `materializeSnowflakeToken`, `client` (typed calls to Studio's main process), `QUERY_KEYS` |
| Paths | `path`, `splitSegments`, `toPosix`, `isInside` |
| Types | `Project`, `FileNode`, `SettingsType`, cloud action types, ... |

This list grows as more of Studio's own tools become extensions. Anything else your extension needs is bundled into it.

### The renderer file format

The renderer entry is one script in AMD shape:

```js
window.rosettaStudio.define('publisher.name', ['react', '@rosetta/studio-api'], (React, studio) => {
  return { activate(api) { /* ... */ } };
});
```

Studio loads the script from the extension folder, passes its own copies of the listed libraries, and calls `activate`. Nothing is evaluated from a string.

`examples/hello/renderer.js` is written by hand in this shape. For a real extension, let the bundler produce it:

**webpack**

```js
module.exports = {
  entry: './src/renderer.tsx',
  output: {
    filename: 'renderer.js',
    library: { type: 'amd', name: 'publisher.name', amdContainer: 'window.rosettaStudio' },
  },
  externals: [
    'react', 'react-dom', 'react/jsx-runtime', '@mui/material', '@mui/material/styles',
    '@emotion/react', '@emotion/styled', 'react-router-dom', 'react-query',
    'monaco-editor', '@rosetta/studio-api',
  ],
};
```

**rollup**

```js
export default {
  input: 'src/renderer.tsx',
  external: [/* the same list */],
  output: { file: 'renderer.js', format: 'amd', amd: { id: 'publisher.name', define: 'window.rosettaStudio.define' } },
};
```

## 6. The main half

Runs in Node inside Studio's main process. A CommonJS file:

```js
exports.activate = (api) => {
  api.ipc.handle('hello:greet', (_event, name) => `Hello, ${name}!`);
};
exports.deactivate = () => { /* stop what you started outside api */ };
```

| Call | Does |
|---|---|
| `api.ipc.handle(channel, handler)` | Answers `api.ipc.invoke(channel, ...)` from the UI half |
| `api.ipc.send(channel, payload, target?)` | Sends an event to the UI half (`api.ipc.on`) in every window, or one |
| `api.bridge.request(operation, payload, { timeoutMs })` | Asks the UI half for something only the open UI knows; it answers with `api.bridge.handle`. Rejects after 15 s by default if no window answers. |
| `api.workspace.onDidSaveFile(listener)` | Runs after a project file was written |
| `api.windows.getMainWindow()` | Studio's main window, or null while it is not open |
| `api.startup.addTask({ id, run })` | Work to do while Studio starts, behind the splash screen. `run({ setMessage })` can change the splash line. A task that throws is logged and Studio still starts. |
| `api.storagePath` | A folder for the extension's own files |
| `api.extensions.getExports(id)` | What another extension's main `activate` returned |
| `api.log` | Console output tagged with the extension id |

The types are in `src/extensionApi/main.ts`.

**Channel names are global.** Prefix them with your extension's name (`hello:greet`). Registering a channel that already exists fails the activation.

`deactivate` runs when the extension is disabled or uninstalled, and when Studio quits (Studio waits for it).

Pieces of Studio's main process that an internal extension may use are in `src/extensionApi/studioMain/` (the install queue, the process adapter, the settings / projects / task-manager services, types). `src/extensions/pipeline/main/index.ts` is a complete main half: backend handlers, a start-up task, and stopping a child process in `deactivate`.

## 7. Internal extensions

The tools that ship with Studio as extensions live in `src/extensions/<name>/` and are compiled into the app. They use the same `activate(api)` and the same API, and are listed in `src/extensionHost/main/builtinExtensions.main.ts` and `src/extensionHost/renderer/builtinExtensions.renderer.ts`.

Lint enforces the boundary:

- A file under `src/extensions/` imports only from `src/extensionApi/`, its own extension folder and npm packages.
- Nothing outside `src/extensions/` imports from it, except those two list files.

If an internal extension needs something from Studio, it is exported through `src/extensionApi/`, which makes it available to installed extensions as well.

The first internal extension is **Pipelines** (`src/extensions/pipeline/`): `manifest.shared.ts` is its manifest and `renderer/index.ts` its `activate`, which shows every UI injection point in use. `tests/unit/extensions/pipeline.activate.test.ts` shows how to test an extension through the real host.

## 8. Rules

1. Reach Studio only through `api` and the shared libraries.
2. Register everything through `api` so it is removed with the extension; clean up the rest in `deactivate`.
3. Prefix IPC channel names and ids with the extension's name.
4. Do not change data that belongs to Studio or to another extension.
5. If the extension cannot be switched live, say so with `requiresRestart`.
