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
} from './screens';
import { SelectProjectLayout, AppShell } from './layouts';
import {
  AppProvider,
  ProcessProvider,
  RunnerProvider,
  TaskManagerProvider,
} from './context';
import { QueryClientContextProvider } from './context/QueryClientContext';
import { themeStorageManager, getStoredThemeMode } from './utils/themeStorage';
import { ScrollbarStyles, UpdateDialog } from './components';
import Loading from './screens/loading';
import { CliProvider } from './hooks/useCli';

const App: React.FC = () => {
  return (
    <Router>
      <ScrollbarStyles />
      <Routes>
        <Route path="/" element={<SelectProjectLayout />}>
          <Route path="/select-project" element={<SelectProject />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
        <Route path="/app" element={<AppShell />}>
          <Route path="" element={<ProjectDetails />} />
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
          <Route path="settings/runner" element={<Settings />} />
          <Route path="settings/keystore" element={<Settings />} />
          <Route path="settings/task-manager" element={<Settings />} />
          <Route path="settings/backup" element={<Settings />} />
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
          <Route path="data-lake/history" element={<DataLake />} />
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
            <RunnerProvider>
              <TaskManagerProvider>
                <CssVarsProvider
                  theme={theme}
                  defaultMode={initialMode}
                  storageManager={themeStorageManager}
                >
                  <CssBaseline />
                  <App />
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
              </TaskManagerProvider>
            </RunnerProvider>
          </ProcessProvider>
        </CliProvider>
      </AppProvider>
    </QueryClientContextProvider>
  );
};

export default AppWithProjectProvider;
