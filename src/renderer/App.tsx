import React from 'react';
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import './App.css';
import './toastStyles.css';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import 'split-pane-react/esm/themes/default.css';
import theme from './theme';
import {
  ProjectDetails,
  Settings,
  Sql,
  AddConnection,
  EditConnection,
  SelectProject,
  Setup,
  CloudExplorer,
  Connections,
  DuckLake as DataLake,
  Notebooks,
  Flows,
  Dashboard,
} from './screens';
import { SelectProjectLayout, AppShell } from './layouts';
import {
  AppProvider,
  CloudRunProvider,
  ProcessProvider,
  QueryResultsProvider,
  TabsProvider,
  TaskManagerProvider,
} from './context';
import { QueryClientContextProvider } from './context/QueryClientContext';
import { themeStorageManager, getStoredThemeMode } from './utils/themeStorage';
import { ScrollbarStyles, UpdateDialog } from './components';
import Loading from './screens/loading';
import { CliProvider } from './hooks/useCli';
import { ExtensionHostProvider } from '../extensionHost/renderer/ExtensionHostProvider.renderer';
import { screens as screenRegistry } from '../extensionHost/renderer/contributions.renderer';
import { useRegistry } from '../extensionHost/renderer/registry.renderer';
import {
  registerSharedModule,
  STUDIO_API_MODULE,
} from '../extensionHost/renderer/sharedModules.renderer';
import { extensionHostRenderer } from '../extensionHost/renderer/index.renderer';
import { builtinRendererExtensions } from '../extensionHost/renderer/builtinExtensions.renderer';
import * as studioApiShared from '../extensionApi/shared';
import * as studioApiRenderer from '../extensionApi/renderer';
import * as studioApiStudio from '../extensionApi/studio';
// The pipeline tool's contributions. Registered from here until the tool
// moves into src/extensions (docs/extensions/PLAN.md, phase 2).
import './components/pipelineView/contributions';

// What an installed extension gets when it asks for '@rosetta/studio-api':
// the same API the internal extensions import.
registerSharedModule(STUDIO_API_MODULE, () => ({
  ...studioApiShared,
  ...studioApiRenderer,
  ...studioApiStudio,
}));

// The extensions that ship inside the app.
builtinRendererExtensions.forEach(({ manifest, module }) =>
  extensionHostRenderer.registerBuiltin(manifest, module),
);

const App: React.FC = () => {
  // Screens added by extensions. Studio's own screens are the routes below.
  const extensionScreens = useRegistry(screenRegistry);

  return (
    <Router>
      <ScrollbarStyles />
      <Routes>
        <Route path="/" element={<SelectProjectLayout />}>
          <Route index element={<Navigate to="/app" replace />} />
          <Route path="select-project" element={<SelectProject />} />
          <Route path="setup" element={<Setup />} />
          <Route path="*" element={<Navigate to="/app" />} />
        </Route>
        <Route path="/app" element={<AppShell />}>
          <Route path="" element={<Dashboard />} />
          <Route path="dbt-project" element={<ProjectDetails />} />
          <Route path="connections" element={<Connections />} />
          <Route path="select-project" element={<SelectProject />} />
          <Route path="edit-connection/:id" element={<EditConnection />} />
          <Route path="add-connection" element={<AddConnection />} />
          <Route path="add-connection/:projectId" element={<AddConnection />} />
          <Route
            path="settings"
            element={<Navigate to="/app/settings/general" />}
          />
          <Route path="settings/general" element={<Settings />} />
          <Route path="settings/duckdb" element={<Settings />} />
          <Route path="settings/profile" element={<Settings />} />
          <Route path="settings/ai-providers" element={<Settings />} />
          <Route path="settings/dbt" element={<Settings />} />
          <Route path="settings/python" element={<Settings />} />
          <Route path="settings/rosetta" element={<Settings />} />
          <Route path="settings/installation" element={<Settings />} />
          <Route path="settings/about" element={<Settings />} />
          <Route path="settings/flowfile" element={<Settings />} />
          <Route path="settings/keystore" element={<Settings />} />
          <Route path="settings/task-manager" element={<Settings />} />
          <Route path="settings/backup" element={<Settings />} />
          {/* Settings pages added through the settings-page registry */}
          <Route path="settings/:section" element={<Settings />} />
          <Route path="sql" element={<Sql />} />
          <Route path="notebooks" element={<Notebooks />} />
          <Route
            path="cloud-explorer"
            element={<Navigate to="/app/cloud-explorer/dashboard" />}
          />
          <Route path="cloud-explorer/dashboard" element={<CloudExplorer />} />
          <Route
            path="cloud-explorer/connections"
            element={<CloudExplorer />}
          />
          <Route
            path="cloud-explorer/recent-items"
            element={<CloudExplorer />}
          />
          <Route
            path="cloud-explorer/new-connection"
            element={<CloudExplorer />}
          />
          <Route
            path="cloud-explorer/edit-connection/:id"
            element={<CloudExplorer />}
          />
          <Route
            path="cloud-explorer/buckets/:connectionId"
            element={<CloudExplorer />}
          />
          <Route
            path="cloud-explorer/bucket/:connectionId/:bucketName"
            element={<CloudExplorer />}
          />
          <Route
            path="data-lake"
            element={<Navigate to="/app/data-lake/dashboard" />}
          />
          <Route path="data-lake/dashboard" element={<DataLake />} />
          <Route path="data-lake/instances" element={<DataLake />} />
          <Route path="data-lake/new-instance" element={<DataLake />} />
          <Route
            path="data-lake/history"
            element={<Navigate to="/app/sql" replace />}
          />
          <Route
            path="data-lake/:type/instances/:instanceId"
            element={<DataLake />}
          />
          <Route
            path="data-lake/:type/instances/:instanceId/edit"
            element={<DataLake />}
          />
          <Route
            path="data-lake/:type/instances/:instanceId/tables/:tableName"
            element={<DataLake />}
          />
          <Route path="flows" element={<Flows />} />
          <Route path="loading" element={<Loading />} />
          {extensionScreens.flatMap((screen) => [
            ...screen.paths.map((path) => (
              <Route
                key={`${screen.id}:${path}`}
                path={path}
                element={<screen.Component />}
              />
            )),
            ...(screen.redirects ?? []).map((redirect) => (
              <Route
                key={`${screen.id}:redirect:${redirect.from}`}
                path={redirect.from}
                element={<Navigate to={redirect.to} replace />}
              />
            )),
          ])}
          <Route path="*" element={<Navigate to="/app" />} />
        </Route>
      </Routes>
    </Router>
  );
};

const AppWithProjectProvider: React.FC = () => {
  // Get the initially stored theme mode
  const initialMode = getStoredThemeMode();

  return (
    <QueryClientContextProvider>
      <AppProvider>
        <CliProvider>
          <ProcessProvider>
            <TaskManagerProvider>
              <CloudRunProvider>
                <TabsProvider>
                  <QueryResultsProvider>
                    <CssVarsProvider
                      theme={theme}
                      defaultMode={initialMode}
                      storageManager={themeStorageManager}
                    >
                      <CssBaseline />
                      <ExtensionHostProvider>
                        <App />
                      </ExtensionHostProvider>
                      <UpdateDialog />
                      <ToastContainer
                        position="bottom-right"
                        autoClose={3000}
                        hideProgressBar={false}
                        newestOnTop
                        closeOnClick
                        rtl={false}
                        pauseOnFocusLoss
                        pauseOnHover
                        theme={initialMode === 'dark' ? 'dark' : 'light'}
                        limit={3}
                      />
                    </CssVarsProvider>
                  </QueryResultsProvider>
                </TabsProvider>
              </CloudRunProvider>
            </TaskManagerProvider>
          </ProcessProvider>
        </CliProvider>
      </AppProvider>
    </QueryClientContextProvider>
  );
};

export default AppWithProjectProvider;
