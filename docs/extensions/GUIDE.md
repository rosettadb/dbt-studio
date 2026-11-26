# Building a Studio extension

An extension adds to Studio without changing Studio's code: a sidebar item, a screen, components inside existing screens, file handlers, bottom panels, commands, settings pages, backend handlers, a database connection, the AI agent of a screen, tools for the project agent.

This guide covers what the extension system supports. Studio's own SQL Editor, Analytics, Notebooks and Pipelines are extensions built with exactly this API; section 7 says where to find a real example of each point. What is planned and not built yet is in `PLAN.md`.

A complete working example is in [`examples/hello`](examples/hello). [`examples/clickhouse`](examples/clickhouse) adds a database connection.

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
| `api.workspaceTabs.add(screenId, tab)` | A tab in a screen that works on one connection (SQL Editor, Notebooks) |
| `api.connections.register({ descriptor, ui })` | The tile, form, icon and label of a database (section 4.8) |
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

**Calling the main half from code outside `activate`.** Service files and components do not have `api`. Create one object for the extension, bind it in `activate`, and call it everywhere else:

```ts
// ipc.ts
export const ipc = createExtensionIpc('My extension');   // from '@rosetta/studio-api'

// index.ts
activate(api) { ipc.bind(api.ipc); /* ... */ }

// anywhere in the extension
const pages = await ipc.invoke('myext:list', connectionId);
const stop = ipc.on('myext:progress', (progress) => { /* ... */ });   // stop() when done
```

A listener added this way is removed when the extension is switched off, also when the code never called `stop()`. Studio's own extensions do all their backend calls this way (`src/extensions/sql/renderer/ipc.ts`).

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

Other `ScreenDefinition` fields: `redirects: [{ from, to }]` (relative paths that redirect to an absolute route) and `assistant: true` (the top bar shows the AI assistant button on this screen).

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

**A tab in a connection screen.** The SQL Editor and Notebooks screens (`STUDIO_WORKSPACES.sql`, `STUDIO_WORKSPACES.notebooks`) take tabs from other extensions (Analytics adds one to each): an entry in the screen's side panel tabs, what the side panel shows, and what the main area shows while the tab is selected.

```js
api.workspaceTabs.add(STUDIO_WORKSPACES.sql, {
  id: 'my-tab',
  order: 200,
  label: 'My tab',
  icon: MyIcon,
  Sidebar: MySidebar,     // receives { connectionId, connectionName, state, setState, onSchemaChange }
  Main: MyMain,           // same props
  assistant: (state) => ({ screenKey: 'sql' }),   // which AI assistant to use; optional
});
```

`state` is whatever the tab needs to remember while the screen is open (the item that is open, for example). `Sidebar` and `Main` share it, and it is reset when the connection changes. Call `onSchemaChange()` after the tab created or dropped a table, so the screen reloads its Data tree; a screen may not give one, so check it first.

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

### 4.8 A database connection

A database has two parts, one in each half, with the same `descriptor` in both.

The main half says how to reach it:

```js
api.connections.register({
  descriptor: { type: 'clickhouse', displayName: 'ClickHouse' },
  validate: async (conn) => { if (!conn.host) throw new Error('Host is required'); },
  test: async (conn) => true,                       // can the server be reached
  query: async (conn, sql, ctx) => ({               // one statement
    success: true, data: [{ id: 1 }], fields: [{ name: 'id', type: -1 }], rowCount: 1,
  }),                                               // on failure: { success: false, error: 'message' }
  extractSchema: async (conn) => ({ tables: [] }),  // tables and columns for the Data tree
});
```

`conn` is the object your form saved. `ctx.onCancelable(fn)` gives Studio the function that stops a running statement (the Stop button). Optional: `sameTarget(a, b)`, `nameHint(conn)`, `agentHint(ctx)`, `validatesOnSave`, `dispose()`.

The UI half says how it looks:

```js
api.connections.register({
  descriptor: { type: 'clickhouse', displayName: 'ClickHouse' },
  ui: {
    icon,                                  // an image URL
    Form: ClickHouseForm,                  // add / edit form; receives { onCancel, connection, duplicateFrom, suggestedName }
    listDetails: (conn) => `${conn.host}:${conn.port}`,   // the line under the name in the connection list
  },
});
```

The form saves with Studio's own hooks from `@rosetta/studio-api`: `useConfigureConnection` (new), `useUpdateConnection` (edit), `useTestConnection`, `useGetConnections` and `useConnectionNameValidation` for the name, and `ConnectionHeader` for the title bar with Save and Close. The saved object must have `type` (your descriptor's type) and `name`.

In the descriptor only `type` and `displayName` are required. Optional: `aliases`, `secrets`, `sql.rules` (`quote`: `double` / `backtick` / `bracket`, `folding`, `limit`; used when Studio writes SQL for the Data tree menu), `capabilities.nativeExport`.

From then on the database has a tile on the add-connection screen, can be saved, tested and edited, is listed with its icon, runs statements in the SQL Editor and Notebooks, and shows its tables in the Data tree. Studio's own twelve databases are registered through the same call.

Limits today:

- A type that already exists (a built-in one, or another extension's) is refused, and the extension fails to start with that message.
- dbt projects cannot use a database added by an extension.
- Connections saved for it stay in the list when the extension is disabled or removed; they cannot be used until it is back.

`examples/clickhouse` is a complete adapter in two plain files, with no dependencies (it talks to ClickHouse over HTTP).

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
| `api.connections.register(connection)` | Adds a database Studio can connect to (section 4.8) |
| `api.connections.onWillDelete(listener)` | Runs before a connection is deleted. Studio waits for it; a listener that throws stops the deletion and the user sees the message. A DuckLake instance comes as `ducklake-<id>`. |
| `api.agents.add(screenKey, factory, options?)` | The AI agent of a screen (section 6.1) |
| `api.projectAgent.addTools(toolset)` | Tools for the project agent (section 6.2) |
| `api.startup.addTask({ id, run })` | Work to do while Studio starts, behind the splash screen. `run({ setMessage })` can change the splash line. A task that throws is logged and Studio still starts. |
| `api.studio` | Studio's own backend pieces (below) |
| `api.storagePath` | A folder for the extension's own files |
| `api.extensions.getExports(id)` | What another extension's main `activate` returned |
| `api.log` | Console output tagged with the extension id |

The types are in `src/extensionApi/main.ts`.

**Channel names are global.** Prefix them with your extension's name (`hello:greet`). Registering a channel that already exists fails the activation.

`deactivate` runs when the extension is disabled or uninstalled, and when Studio quits (Studio waits for it).

**Studio's own backend pieces: `api.studio`.** Everything the extensions that ship with Studio are built from is handed to every extension:

```js
exports.activate = (api) => {
  const { ConnectorsService, ToolLoopAgent, tool, z, createStudioSqlTools, composeAgentRuntime } = api.studio;
  // ...
};
```

| Group | Pieces |
|---|---|
| Agents | `ToolLoopAgent`, `tool`, `stepCountIs`, `z` (Studio's copies of the AI SDK and zod: use these, not your own bundled copies), `composeAgentRuntime`, `AgentService` (the context of a running chat, the SQL editor bridge), `TerminalConfirmGate`, `truncateToolResult`, `isToolEnabled` |
| Tool sets for an agent | `createStudioSqlTools`, `createSqlResultInspectorTools`, `createStudioDuckLakeTools`, `createStudioCloudTools`, `createStudioConnectionsTools`, `createDbtTools`, `createFilesystemTools` |
| Connections and data | `ConnectorsService`, `DuckLakeService`, `getConnector`, `agentHintFor`, `databaseStore` (database.json), `MainDatabaseService` (SQLite), `onWillDeleteConnection` |
| Settings, installs, processes | `SettingsService`, `ProjectsService`, `TaskManagerService`, `PythonRuntimesService`, `runInstallTask`, `ProcessAdapter`, `broadcastToRenderers`, `emitFileDidSave` |
| Helpers | `toDisposable`, `extensionIdOf`, `DEFAULT_SECRETS` |

The list is `src/extensionApi/studioMain/index.ts` plus `src/extensionApi/shared.ts`. Extensions that ship with Studio import the same files from `src/extensionApi/studioMain/` at build time; `tests/unit/extensionHost/apiParity.test.ts` fails when a file of that folder is not in the list, so an internal extension cannot use something an installed one does not get. The same test guards the UI side (`src/extensionApi/studio/` and `@rosetta/studio-api`).

`src/extensions/pipeline/main/index.ts` is a complete main half: backend handlers, a start-up task, and stopping a child process in `deactivate`.

### 6.1 The AI agent of a screen

A screen that opens the assistant gives its chat a `screenKey` (the SQL Editor uses `sql`). The extension that owns the screen says which agent answers there:

```ts
api.agents.add('sql', (base, context) => createSqlAgent(base, {
  connectionMeta: context.connectionMeta,
  enabledTools: context.enabledTools,
  skills: context.skills,
  conversationId: context.conversationId,
  toolMode: context.toolMode,
}));
```

- `base` is what Studio gives every agent: the model the user chose, the MCP tools, the skills, the step limit and the step hooks.
- `context` is the run: `conversationId`, `toolMode` (`chat` is Ask, read-only; `agent` is Code), `connectionMeta` and `connectionId`, `notebookId`, `pageId`, `enabledTools` (the project tools the user allows, without the ones that write), `disabledTools`, `skills`.
- The factory returns the agent (Studio's own are `ToolLoopAgent`s from the `ai` package, put together with `composeAgentRuntime`).
- `options.emptyAnswerFallback(toolCalls)` may return what to say when the model ends a run without writing anything; null leaves Studio's general message.

One agent per screen key. `project` is Studio's own. While the extension is off, the chat of its screen cannot run.

Shared tool sets an agent can use are in `api.studio` (section 6): connection SQL tools, DuckLake, cloud storage, connections, and the dbt and file tools of a linked project. Build the agent with `api.studio.ToolLoopAgent` and `api.studio.tool`.

When a tool has to reach something only the open window knows (the cells of the open notebook), the main half sends a request on its own channel to the window of the chat and waits for the answer: `AgentService.getAgentContext(conversationId)` gives that window (`context.event.sender`). `src/extensions/notebooks/main/notebookAgentBridge.ts` is a complete one, with time-out and factory-reset handling.

`src/extensions/sql/main/index.ts` (one agent), `src/extensions/analytics/main/index.ts` (agent and bridge) and `src/extensions/notebooks/main/index.ts` (agent, bridge, the empty-answer text, `onWillDelete`) are the examples.

### 6.2 Tools for the project agent

The assistant of the project screen is Studio's. An extension adds tools to it:

```ts
api.projectAgent.addTools({
  id: 'pipeline',
  tools: [
    { name: 'studio_pipeline_list', description: 'List pipeline YAML files in the active project', readOnly: true },
    { name: 'studio_pipeline_update', description: 'Update an existing validated pipeline ...', readOnly: false },
  ],
  createTools: (projectPath) => createStudioPipelineTools(projectPath),
  promptSection: '### Pipeline Authoring Tools\n- studio_pipeline_list: ...\n\nAlways list before selecting a pipeline. ...',
  context: { tag: 'pipeline_authoring_context', build: (projectPath, project) => buildProjectPipelineContext(projectPath, project) },
  guardWrite: (projectPath, filePath) => (isPipelineFile(projectPath, filePath) ? 'Pipeline files must be written with the pipeline tools.' : null),
});
```

| Field | What Studio does with it |
|---|---|
| `tools` | Names and one-line descriptions. A `readOnly` tool is offered in Ask mode and listed there; one that changes something is left out in Ask mode. They also show in the tool list of AI settings (`listDescription` if given). |
| `createTools(projectPath)` | The tools themselves, keyed by name, built for every run. |
| `promptSection` | A section of the tool list in the Code-mode instructions of dbt projects. |
| `relatedTools` | Tools of Studio the section tells the agent to use; listed after yours for projects without dbt. |
| `context` | A block of text built for every run and put into the instructions inside `<tag>...</tag>`. |
| `guardWrite(projectPath, filePath)` | A message when the general file tools (`writeFile`, `writeDbtModel`) must not write that file because it belongs to your tools; null lets them. |

The text goes into fixed places of the agent's instructions, so with one toolset the instructions read as if the tools were built in. A tool name that is already taken is refused. `src/extensions/pipeline/main/pipelineToolset.ts` is the example.

How the chat shows a tool call (the line "Read pipeline", the result box) is still Studio's for every tool; an unknown tool gets the general display.

## 7. Internal extensions

The tools that ship with Studio as extensions live in `src/extensions/<name>/` and are compiled into the app. They use the same `activate(api)` and the same API, and are listed in `src/extensionHost/main/builtinExtensions.main.ts` and `src/extensionHost/renderer/builtinExtensions.renderer.ts`.

Lint enforces the boundary:

- A file under `src/extensions/` imports only from `src/extensionApi/`, its own extension folder and npm packages.
- Nothing outside `src/extensions/` imports from it, except those two list files.

If an internal extension needs something from Studio, it is exported through `src/extensionApi/`, which makes it available to installed extensions as well.

The **SQL Editor** (`src/extensions/sql/`) is the second: a sidebar entry, a screen with the assistant button, a Home card, and in its main half the saved queries and the AI agent of the SQL Editor screen.

**Analytics** (`src/extensions/analytics/`) is the third: a tab in the SQL Editor and Notebooks screens, a Home card with `onSelect`, and in its main half the Analytics page channels, the static site export (which uses `api.windows.getMainWindow()` to report progress), and the AI agent of the Analytics tab.

**Notebooks** (`src/extensions/notebooks/`) is the fourth: a sidebar entry, a screen that itself takes tabs from other extensions (`STUDIO_WORKSPACES.notebooks`), a Home card, and a main half with the notebook stores, environments and kernels, the AI agent of the Notebooks screen, and a `deactivate()` that stops every running kernel when Studio quits or the extension is switched off.

The first internal extension is **Pipelines** (`src/extensions/pipeline/`): `manifest.shared.ts` is its manifest and `renderer/index.ts` its `activate`, which shows most UI injection points in use. Its main half has the local runner, the pipeline templates, and the pipeline tools of the project agent (`main/pipelineToolset.ts`).

Where to look for a real example of each injection point:

| Injection point | Example |
|---|---|
| Sidebar item, screen, Home card | `src/extensions/sql/renderer/index.ts`, `contributions.tsx` |
| Screen with the assistant button | `src/extensions/notebooks/renderer/index.ts` (`assistant: true`) |
| A tab in a connection screen | `src/extensions/analytics/renderer/workspaceTab.tsx` |
| A screen that takes tabs from others | `src/extensions/sql/renderer/SqlScreen.tsx` (`useWorkspaceTabs`) |
| Slots, file tree buttons, project menu entries | `src/extensions/pipeline/renderer/index.ts` |
| File handler | `src/extensions/pipeline/renderer/PipelineFileView.tsx` |
| Bottom panel, settings page, app provider, commands | `src/extensions/pipeline/renderer/index.ts` |
| Home card with its own action | `src/extensions/analytics/renderer/contributions.tsx` (`onSelect`) |
| Backend handlers | `src/extensions/sql/main/index.ts` |
| Start-up task, stopping a process on `deactivate` | `src/extensions/pipeline/main/index.ts` |
| Stopping kernels on `deactivate` | `src/extensions/notebooks/main/index.ts` |
| Progress events to the main window | `src/extensions/analytics/main/staticSiteHandlers.ts` |
| The AI agent of a screen | `src/extensions/sql/main/index.ts`, `sqlAgent.ts` |
| An agent's bridge to the open window | `src/extensions/notebooks/main/notebookAgentBridge.ts` |
| Tools for the project agent | `src/extensions/pipeline/main/pipelineToolset.ts` |
| Before a connection is deleted | `src/extensions/notebooks/main/index.ts` (`onWillDelete`) |
| A database connection | `docs/extensions/examples/clickhouse/` |

## 8. Testing an extension

Test it through the real hosts, not by calling its functions one by one: that is what proves the extension adds what it should and takes everything back.

- **UI half:** create an `ExtensionHostRenderer`, `registerBuiltin(manifest, module)`, `apply([description])` with the state `active`, check the registries (`navigationItems`, `screens`, `dashboardCards`, `workspaceTabRegistry(screenId)`, the connection lookups), then `apply` again with `disabled` and check they are empty.
- **Main half:** create an `ExtensionHostMain`, `registerBuiltin(manifest, module)`, `start()`, check `host.list()` says `active` and that `ipcMain.handle` got the channels; `deactivateAll()` and check what was given to Studio is gone (a screen agent, project agent tools, a database).
- **An installed extension:** `host.install(folder)` runs the real install from a folder, as Settings → Extensions does.
- Stop every host a test started (`deactivateAll()`), or what it registered stays for the next test.
- Mock what is not under test at its own module (the AI SDK, a heavy service). Studio pieces reached through `src/extensionApi/` are mocked at their original Studio path; the API file only re-exports them.

Examples: `tests/unit/extensions/sql.activate.test.ts` (both halves and the agent), `notebooks.activate.test.ts` (agent, bridge channels, connection deletion, kernel shutdown), `pipeline.main.test.ts` (handlers, start-up task, project agent tools), `clickhouseExample.test.ts` (install from a folder, a database used through Studio's services), `clickhouseExampleForm.test.tsx` (a UI script loaded the way the loader does).

## 9. Rules

1. Reach Studio only through `api` (`api.studio` in the main half) and the shared libraries (`@rosetta/studio-api` in the UI half).
2. Register everything through `api` so it is removed with the extension; clean up the rest in `deactivate`.
3. Prefix IPC channel names and ids with the extension's name.
4. Do not change data that belongs to Studio or to another extension.
5. If the extension cannot be switched live, say so with `requiresRestart`.
6. Keep what users already have: the same routes, labels, stored keys and IPC channel names when a tool moves into an extension.
