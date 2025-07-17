import React from 'react';
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import './App.css';
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
  CloudExplorerBuckets,
  CloudExplorerBucketContent,
} from './screens';
import { SelectProjectLayout } from './layouts';
import { AppProvider, ProcessProvider } from './context';
import { QueryClientContextProvider } from './context/QueryClientContext';
import { themeStorageManager, getStoredThemeMode } from './utils/themeStorage';
import { ScrollbarStyles, UpdateDialog } from './components';
import Loading from './screens/loading';

const App: React.FC = () => {
  return (
    <Router>
      <CssBaseline />
      <ScrollbarStyles />
      <Routes>
        <Route path="/" element={<SelectProjectLayout />}>
          <Route path="/select-project" element={<SelectProject />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
        <Route path="/app">
          <Route path="" element={<ProjectDetails />} />
          <Route path="select-project" element={<SelectProject />} />
          <Route path="edit-connection" element={<EditConnection />} />
          <Route path="add-connection" element={<AddConnection />} />
          <Route
            path="settings"
            element={<Navigate to="/app/settings/general" />}
          />
          <Route path="settings/general" element={<Settings />} />
          <Route path="settings/ai-providers" element={<Settings />} />
          <Route path="settings/dbt" element={<Settings />} />
          <Route path="settings/rosetta" element={<Settings />} />
          <Route path="settings/installation" element={<Settings />} />
          <Route path="settings/about" element={<Settings />} />
          <Route path="sql" element={<Sql />} />
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
            element={<CloudExplorerBuckets />}
          />
          <Route
            path="cloud-explorer/bucket/:connectionId/:bucketName"
            element={<CloudExplorerBucketContent />}
          />
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
        <ProcessProvider>
          <CssVarsProvider
            theme={theme}
            defaultMode={initialMode}
            storageManager={themeStorageManager}
          >
            <App />
            <UpdateDialog />
            <ToastContainer
              position="bottom-right"
              autoClose={5000}
              hideProgressBar={false}
              newestOnTop={false}
              closeOnClick={false}
              rtl={false}
              pauseOnFocusLoss
              pauseOnHover
              theme={initialMode === 'dark' ? 'dark' : 'light'}
            />
          </CssVarsProvider>
        </ProcessProvider>
      </AppProvider>
    </QueryClientContextProvider>
  );
};

export default AppWithProjectProvider;
