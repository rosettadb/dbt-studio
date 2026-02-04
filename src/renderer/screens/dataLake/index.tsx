import React, { useState } from 'react';
import { Typography, Box, Button, styled } from '@mui/material';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../layouts';
import {
  DataLakeDashboard,
  DataLakeSidebar,
  DataLakeInstances,
  DataLakeTablesView,
  DataLakeConnectionWizard,
  DataLakeInstanceDetails,
  DataLakeInstanceEditForm,
  DataLakeTableDetails,
} from '../../components/dataLake';
import { DataLakeCard } from '../../components/dataLakeCards';
import {
  NotebookEditor,
  NotebooksList,
} from '../../components/notebook';
import {
  useDuckLakeInstances,
  useCreateDuckLakeInstance,
  useDuckLakeInstance,
  useDeleteDuckLakeInstance,
} from '../../controllers/duckLake.controller';

const DataLake: React.FC = () => {
  const location = useLocation();
  const params = useParams<{
    type?: string;
    instanceId?: string;
    notebookId?: string;
    tableName?: string;
  }>();
  const navigate = useNavigate();

  // Extract type from URL params (for type-specific routes)
  const { type, instanceId, notebookId, tableName } = params;

  // State for type selection in new-instance flow
  const [selectedType, setSelectedType] = useState<string>();

  // React Query hooks
  const instancesQuery = useDuckLakeInstances();
  // Add type field to instances for routing
  const instances = (instancesQuery.data || []).map((i) => ({
    ...i,
    type: 'duck-lake', // Hardcoded for now since only DuckLake exists
  }));
  const createInstanceMutation = useCreateDuckLakeInstance();

  // Mutations for instance actions
  const deleteMutation = useDeleteDuckLakeInstance();

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
    // Check for notebook editor route: /app/duck-lake/instances/:id/notebooks/:notebookId
    if (
      pathSegments.includes('instances') &&
      pathSegments.includes('notebooks') &&
      notebookId
    ) {
      return 'notebook-editor';
    }
    // Check for notebooks list route: /app/duck-lake/instances/:id/notebooks
    if (pathSegments.includes('instances') && pathSegments.includes('notebooks')) {
      return 'instance-notebooks';
    }
    // Check for table detail route pattern: /app/duck-lake/instances/:id/tables/:tableName
    if (
      pathSegments.includes('instances') &&
      pathSegments.includes('tables') &&
      pathSegments.length > 6
    ) {
      return 'table-detail';
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

  // Define data lake types (UI only)
  const dataLakeTypes = [
    {
      id: 'duck-lake',
      name: 'DuckLake',
      description: 'Lightweight, local-first lakehouse for DuckDB',
      img: 'duckLake' as const,
      disabled: false,
    },
    {
      id: 'iceberg',
      name: 'Apache Iceberg',
      description: 'Multi-engine, cloud-agnostic open standard',
      img: 'apacheIcebergLake' as const,
      disabled: true,
    },
    {
      id: 'delta',
      name: 'Delta Lake',
      description: 'Strong ACID transactions and time travel',
      img: 'deltaLake' as const,
      disabled: true,
    },
    {
      id: 'hudi',
      name: 'Apache Hudi',
      description: 'Streaming and incremental pipelines',
      img: 'apacheHudiLake' as const,
      disabled: true,
    },
  ];

  // Styled container for cards (reuse from addConnection pattern)
  const ConnectionCardsContainer = styled(Box)`
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 24px;
    padding: 12px 0 36px;
    max-width: 1400px;
    margin: 0 auto;
  `;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleTablePreview = (tableId: string) => {
    // In real implementation, this would open a preview modal
  };

  const handleTableQuery = (tableId: string) => {
    // eslint-disable-next-line no-console
    console.log(tableId);
    // In real implementation, this would navigate to SQL editor with table query
  };

  // Get current instance ID from params or path
  const currentInstanceId =
    instanceId || pathSegments[pathSegments.indexOf('instance') + 1];

  // Get instance details if viewing a specific instance
  const instanceQuery = useDuckLakeInstance(
    currentSection === 'instance-detail' ? currentInstanceId || '' : '',
  );
  const currentInstance = instanceQuery.data;

  // Tables are now handled by DuckLakeTablesView component

  // Render content based on current section
  const renderContent = () => {
    switch (currentSection) {
      case 'dashboard':
        return <DataLakeDashboard instances={instances as any} />;

      case 'instances':
        return <DataLakeInstances />;

      case 'instance-tables':
        // Show tables for a specific instance from route: /instances/:id/tables
        return (
          <DataLakeTablesView
            instanceId={currentInstanceId || ''}
            onPreview={handleTablePreview}
            onQuery={handleTableQuery}
          />
        );

      case 'tables':
        // Show tables for a specific instance if instanceId is in URL
        if (instanceId) {
          return (
            <DataLakeTablesView
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
        // Step 1: Show type selection cards
        if (!selectedType) {
          return (
            <Box sx={{ p: 2 }}>
              <Typography variant="h6" component="h6" gutterBottom>
                Create New DataLake
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Select a data lake type to create a new instance
              </Typography>
              <ConnectionCardsContainer>
                {dataLakeTypes.map((lakeType, index) => (
                  <DataLakeCard
                    key={index}
                    itemDetails={lakeType}
                    onClick={() => setSelectedType(lakeType.id)}
                  />
                ))}
              </ConnectionCardsContainer>
            </Box>
          );
        }

        // Step 2: Show wizard for selected type (only duck-lake is implemented)
        if (selectedType === 'duck-lake') {
          return (
            <DataLakeConnectionWizard
              onComplete={async (wizardData) => {
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
                // Navigate to type-specific route
                navigate(
                  `/app/data-lake/duck-lake/instances/${newInstance.id}`,
                );
              }}
              onCancel={() => {
                setSelectedType(undefined);
                navigate('/app/data-lake/instances');
              }}
              isLoading={createInstanceMutation.isLoading}
            />
          );
        }

        // Other types not yet implemented
        return (
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">Coming Soon</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedType} support is coming in a future release.
            </Typography>
            <Button onClick={() => setSelectedType(undefined)} sx={{ mt: 2 }}>
              Back to Type Selection
            </Button>
          </Box>
        );

      case 'edit-instance':
        return <DataLakeInstanceEditForm key={instanceId} />;

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
                onClick={() => navigate('/app/data-lake/instances')}
              >
                Back to Instances
              </Button>
            </Box>
          );
        }

        return (
          <DataLakeInstanceDetails
            instance={currentInstance as any}
            onEdit={(id) =>
              navigate(
                `/app/data-lake/${type || 'duck-lake'}/instances/${id}/edit`,
              )
            }
            onDelete={(id) => {
              deleteMutation.mutate(id, {
                onSuccess: () => navigate('/app/data-lake/instances'),
              });
            }}
            isLoading={deleteMutation.isLoading}
          />
        );

      case 'table-detail':
        // Phase 8b: Render comprehensive table detail view
        return <DataLakeTableDetails />;

      case 'instance-notebooks':
        // Show notebooks list for a specific instance
        return (
          <NotebooksList
            instanceId={currentInstanceId || ''}
            instanceType={type || 'duck-lake'}
          />
        );

      case 'notebook-editor':
        // Show notebook editor
        if (!notebookId || !currentInstanceId) {
          return (
            <Box sx={{ p: 2 }}>
              <Typography variant="body1" color="text.secondary">
                Invalid notebook or instance ID
              </Typography>
            </Box>
          );
        }
        return (
          <NotebookEditor
            instanceId={currentInstanceId}
            notebookId={notebookId}
          />
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
    <AppLayout sidebarContent={<DataLakeSidebar instances={instances} />}>
      <Box sx={{ p: 2 }}>
        <Box>{renderContent()}</Box>
      </Box>
    </AppLayout>
  );
};

export default DataLake;
