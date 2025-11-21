import React from 'react';
import { Typography, Box, Button } from '@mui/material';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../layouts';
import {
  DuckLakeDashboard,
  DuckLakeSidebar,
  DuckLakeInstances,
  DuckLakeTablesView,
  DuckLakeConnectionWizard,
  DuckLakeInstanceDetails,
  DuckLakeInstanceEditForm,
} from '../../components/duckLake';
import {
  useDuckLakeInstances,
  useCreateDuckLakeInstance,
  useDuckLakeInstance,
  useConnectDuckLakeInstance,
  useDisconnectDuckLakeInstance,
  useDeleteDuckLakeInstance,
  useRefreshDuckLakeInstanceHealth,
} from '../../controllers/duckLake.controller';

// Mock recent queries data - this would come from backend in real implementation
const mockRecentQueries = [
  {
    id: 'query-1',
    query: 'SELECT * FROM customer_analytics WHERE region = "US"',
    instanceId: 'instance-1',
    instanceName: 'Analytics Lake',
    executedAt: new Date(Date.now() - 1800000).toISOString(),
    duration: 245,
  },
  {
    id: 'query-2',
    query: 'SELECT COUNT(*) FROM sales_data',
    instanceId: 'instance-1',
    instanceName: 'Analytics Lake',
    executedAt: new Date(Date.now() - 3600000).toISOString(),
    duration: 89,
  },
];

const mockRecentTables = [
  {
    id: 'table-1',
    name: 'customer_analytics',
    instanceId: 'instance-1',
    instanceName: 'Analytics Lake',
    accessedAt: new Date(Date.now() - 3600000).toISOString(),
    rowCount: 1250000,
  },
  {
    id: 'table-2',
    name: 'sales_data',
    instanceId: 'instance-1',
    instanceName: 'Analytics Lake',
    accessedAt: new Date(Date.now() - 7200000).toISOString(),
    rowCount: 850000,
  },
];

const DuckLake: React.FC = () => {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();

  // React Query hooks
  const instancesQuery = useDuckLakeInstances();
  const instances = instancesQuery.data || [];
  const createInstanceMutation = useCreateDuckLakeInstance();

  // Mutations for instance actions
  const connectMutation = useConnectDuckLakeInstance();
  const disconnectMutation = useDisconnectDuckLakeInstance();
  const deleteMutation = useDeleteDuckLakeInstance();
  const refreshHealthMutation = useRefreshDuckLakeInstanceHealth();

  // Parse the current section from the pathname
  const pathSegments = location.pathname.split('/');
  const currentSection = (() => {
    if (pathSegments.includes('new-instance')) {
      return 'new-instance';
    }
    // Check for edit route pattern: /app/duck-lake/instances/:id/edit
    if (pathSegments.includes('edit')) {
      return 'edit-instance';
    }
    // Check for tables route pattern: /app/duck-lake/instances/:id/tables
    if (pathSegments.includes('instances') && pathSegments.includes('tables')) {
      return 'instance-tables';
    }
    if (pathSegments.includes('instances') && pathSegments.length > 4) {
      return 'instance-detail';
    }
    if (pathSegments.includes('instances')) {
      return 'instances';
    }
    if (pathSegments.includes('tables')) {
      return 'tables';
    }
    if (pathSegments.includes('history')) {
      return 'history';
    }
    if (pathSegments.includes('instance') && pathSegments.length > 4) {
      return 'instance-detail';
    }
    if (pathSegments.includes('table') && pathSegments.length > 4) {
      return 'table-detail';
    }
    return pathSegments.pop() || 'dashboard';
  })();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleTablePreview = (tableId: string) => {
    // In real implementation, this would open a preview modal
  };

  const handleTableQuery = (tableId: string) => {
    // eslint-disable-next-line no-console
    console.log(tableId);
    // In real implementation, this would navigate to SQL editor with table query
  };

  // Get current instance for detail views
  const instanceId =
    params.instanceId || pathSegments[pathSegments.indexOf('instance') + 1];

  // Get instance details if viewing a specific instance
  const instanceQuery = useDuckLakeInstance(
    currentSection === 'instance-detail' ? instanceId || '' : '',
  );
  const currentInstance = instanceQuery.data;

  // Tables are now handled by DuckLakeTablesView component

  // Render content based on current section
  const renderContent = () => {
    switch (currentSection) {
      case 'dashboard':
        return (
          <DuckLakeDashboard
            instances={instances as any}
            recentQueries={mockRecentQueries}
            recentTables={mockRecentTables}
          />
        );

      case 'instances':
        return <DuckLakeInstances />;

      case 'instance-tables':
        // Show tables for a specific instance from route: /instances/:id/tables
        return (
          <DuckLakeTablesView
            instanceId={instanceId || ''}
            onPreview={handleTablePreview}
            onQuery={handleTableQuery}
          />
        );

      case 'tables':
        // Show tables for a specific instance if instanceId is in URL
        if (instanceId) {
          return (
            <DuckLakeTablesView
              instanceId={instanceId}
              onPreview={handleTablePreview}
              onQuery={handleTableQuery}
            />
          );
        }
        // Otherwise show message to select an instance
        return (
          <Box sx={{ p: 2 }}>
            <Typography
              variant="h4"
              component="h1"
              sx={{ fontWeight: 'bold', mb: 3 }}
            >
              Tables
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Please select an instance from the sidebar to view its tables.
            </Typography>
          </Box>
        );

      case 'history':
        return (
          <Box sx={{ p: 2 }}>
            <Typography
              variant="h4"
              component="h1"
              sx={{ fontWeight: 'bold', mb: 3 }}
            >
              Query History
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Query history functionality coming soon...
            </Typography>
          </Box>
        );

      case 'new-instance':
        return (
          <DuckLakeConnectionWizard
            onComplete={async (wizardData) => {
              // Ensure dataPath is defined (it should always be computed by the wizard)
              if (!wizardData.basics.dataPath) {
                throw new Error(
                  'Data path is required but was not provided by the wizard',
                );
              }

              const createRequest = {
                name: wizardData.basics.name,
                dataPath: wizardData.basics.dataPath,
                description: wizardData.basics.description,
                catalog: wizardData.catalog,
                storage: wizardData.storage,
                runtimeOptions: wizardData.runtime,
              };
              const newInstance =
                await createInstanceMutation.mutateAsync(createRequest);
              navigate(`/app/duck-lake/instances/${newInstance.id}`);
            }}
            onCancel={() => navigate('/app/duck-lake/instances')}
            isLoading={createInstanceMutation.isLoading}
          />
        );

      case 'edit-instance':
        return <DuckLakeInstanceEditForm />;

      case 'instance-detail':
        if (instanceQuery.isLoading) {
          return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <Typography>Loading instance details...</Typography>
            </Box>
          );
        }

        if (instanceQuery.error || !currentInstance) {
          return (
            <Box sx={{ p: 2 }}>
              <Typography
                variant="h4"
                component="h1"
                sx={{ fontWeight: 'bold', mb: 3 }}
              >
                Instance Not Found
              </Typography>
              <Typography variant="body1" color="text.secondary">
                The requested instance could not be found.
              </Typography>
              <Button
                variant="contained"
                sx={{ mt: 2 }}
                onClick={() => navigate('/app/duck-lake/instances')}
              >
                Back to Instances
              </Button>
            </Box>
          );
        }

        return (
          <DuckLakeInstanceDetails
            instance={currentInstance as any}
            onConnect={(id) => connectMutation.mutate(id)}
            onDisconnect={(id) => disconnectMutation.mutate(id)}
            onEdit={(id) => navigate(`/app/duck-lake/instances/${id}/edit`)}
            onDelete={(id) => {
              deleteMutation.mutate(id, {
                onSuccess: () => navigate('/app/duck-lake/instances'),
              });
            }}
            onRefreshHealth={(id) => refreshHealthMutation.mutate(id)}
            isLoading={
              connectMutation.isLoading ||
              disconnectMutation.isLoading ||
              deleteMutation.isLoading ||
              refreshHealthMutation.isLoading
            }
          />
        );

      case 'table-detail':
        return (
          <Box sx={{ p: 2 }}>
            <Typography
              variant="h4"
              component="h1"
              sx={{ fontWeight: 'bold', mb: 3 }}
            >
              Table Details
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Table detail view coming soon...
            </Typography>
          </Box>
        );

      default:
        return (
          <Box sx={{ p: 2 }}>
            <Typography
              variant="h4"
              component="h1"
              sx={{ fontWeight: 'bold', mb: 3 }}
            >
              DuckLake
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Section not found: {currentSection}
            </Typography>
          </Box>
        );
    }
  };

  return (
    <AppLayout
      sidebarContent={
        <DuckLakeSidebar
          instances={instances.map((i) => ({
            id: i.id,
            name: i.name,
            status: i.status,
            storageType: i.storage?.type as
              | 'local'
              | 's3'
              | 'azure'
              | 'gcs'
              | undefined,
          }))}
        />
      }
    >
      <Box sx={{ p: 2 }}>
        <Box>{renderContent()}</Box>
      </Box>
    </AppLayout>
  );
};

export default DuckLake;
