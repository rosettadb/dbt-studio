import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Button,
  styled,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
} from '@mui/material';
import { Close, ThumbUp, CheckCircle } from '@mui/icons-material';
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
  useDuckLakeInstances,
  useCreateDuckLakeInstance,
  useDuckLakeInstance,
  useDeleteDuckLakeInstance,
} from '../../controllers';
import { DuckLakeService } from '../../services';

const DataLake: React.FC = () => {
  const location = useLocation();
  const params = useParams<{
    type?: string;
    instanceId?: string;
  }>();
  const navigate = useNavigate();

  // Extract type from URL params (for type-specific routes)
  const { type, instanceId } = params;

  // State for type selection in new-instance flow
  const [selectedType, setSelectedType] = useState<string>();

  // Upvote modal state
  const [voteTarget, setVoteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [voteName, setVoteName] = useState('');
  const [voteEmail, setVoteEmail] = useState('');
  const [voteComment, setVoteComment] = useState('');
  const [voteSubmitted, setVoteSubmitted] = useState(false);

  const handleVoteClose = () => {
    setVoteTarget(null);
    setVoteName('');
    setVoteEmail('');
    setVoteComment('');
    setVoteSubmitted(false);
  };

  const handleVoteSubmit = () => {
    setVoteSubmitted(true);
  };

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

  // Get current instance ID from params or path
  const currentInstanceId =
    instanceId || pathSegments[pathSegments.indexOf('instance') + 1];

  // Get instance details if viewing a specific instance
  const instanceQuery = useDuckLakeInstance(
    currentSection === 'instance-detail' ? currentInstanceId || '' : '',
  );
  const currentInstance = instanceQuery.data;

  // DuckLake connection lifecycle management
  // Acquire connection when viewing instance details, tables, or table details
  // Release connection when navigating away or component unmounts
  useEffect(() => {
    let acquiredInstanceId: string | null = null;

    const acquireConnectionForInstance = async () => {
      // Check if we're viewing any page that uses a DuckLake instance connection
      const instanceViewingSections = [
        'instance-detail',
        'instance-tables',
        'tables',
        'table-detail',
      ];

      if (
        instanceViewingSections.includes(currentSection) &&
        (instanceId || currentInstanceId)
      ) {
        const targetInstanceId = instanceId || currentInstanceId;
        if (targetInstanceId) {
          try {
            await DuckLakeService.acquireConnection(targetInstanceId);
            acquiredInstanceId = targetInstanceId;
          } catch {
            /* empty */
          }
        }
      }
    };

    acquireConnectionForInstance();

    // Cleanup: release connection when navigating away or component unmounts
    return () => {
      if (acquiredInstanceId) {
        DuckLakeService.releaseConnection(acquiredInstanceId);
      }
    };
  }, [currentSection, instanceId, currentInstanceId]);

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
        return <DataLakeTablesView instanceId={currentInstanceId || ''} />;

      case 'tables':
        // Show tables for a specific instance if instanceId is in URL
        if (instanceId) {
          return <DataLakeTablesView instanceId={instanceId} />;
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
                    onClick={() =>
                      lakeType.disabled
                        ? setVoteTarget({
                            id: lakeType.id,
                            name: lakeType.name,
                          })
                        : setSelectedType(lakeType.id)
                    }
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
      sidebarContent={<DataLakeSidebar instances={instances} />}
      panelTitle="DataLake"
    >
      <Box sx={{ p: 2 }}>
        <Box>{renderContent()}</Box>
      </Box>

      {/* Upvote Dialog */}
      <Dialog
        open={!!voteTarget}
        onClose={handleVoteClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Vote for {voteTarget?.name}
          <IconButton
            onClick={handleVoteClose}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {voteSubmitted ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                py: 4,
                gap: 2,
              }}
            >
              <CheckCircle sx={{ fontSize: 56, color: 'success.main' }} />
              <Typography variant="h6">Thanks for your vote!</Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                We&apos;ve recorded your interest in {voteTarget?.name}.
                We&apos;ll prioritize based on community demand.
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Let us know you&apos;re interested in {voteTarget?.name}{' '}
                support. Your vote helps us prioritize what to build next.
              </Typography>
              <TextField
                label="Name (optional)"
                fullWidth
                margin="normal"
                value={voteName}
                onChange={(e) => setVoteName(e.target.value)}
              />
              <TextField
                label="Email (optional)"
                fullWidth
                margin="normal"
                type="email"
                value={voteEmail}
                onChange={(e) => setVoteEmail(e.target.value)}
                helperText="We'll notify you when this feature is available"
              />
              <TextField
                label="What would you use it for? (optional)"
                fullWidth
                margin="normal"
                multiline
                rows={3}
                value={voteComment}
                onChange={(e) => setVoteComment(e.target.value)}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          {voteSubmitted ? (
            <Button onClick={handleVoteClose} variant="contained">
              Close
            </Button>
          ) : (
            <>
              <Button
                onClick={handleVoteClose}
                color="inherit"
                startIcon={<Close />}
              >
                Cancel
              </Button>
              <Button
                onClick={handleVoteSubmit}
                variant="contained"
                startIcon={<ThumbUp />}
              >
                Submit Vote
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </AppLayout>
  );
};

export default DataLake;
