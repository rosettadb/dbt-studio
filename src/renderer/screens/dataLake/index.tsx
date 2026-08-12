import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Button,
  styled,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  DialogContentText,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
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
import { IcebergConnectionWizard } from '../../components/dataLake/IcebergConnectionWizard';
import {
  IcebergDetail,
  IcebergTableDetails,
} from '../../components/dataLake/iceberg/IcebergDetail';
import { DataLakeCard } from '../../components/dataLakeCards';
import {
  useDuckLakeInstances,
  useCreateDuckLakeInstance,
  useDuckLakeInstance,
  useDeleteDuckLakeInstance,
} from '../../controllers';
import {
  useListIcebergInstances,
  useCreateIcebergInstance,
  useGetIcebergInstance,
  useUpdateIcebergInstance,
  useDeleteIcebergInstance,
  useEnsureIcebergInstalledOnMount,
} from '../../controllers/icebergDatalake.controller';
import { DuckLakeService } from '../../services';
import type {
  CreateIcebergInstanceDTO,
  IcebergCatalogType,
  IcebergCloudProvider,
  IcebergInstanceConfig,
  IcebergStorageType,
} from '../../../types/iceberg';
import type { IcebergWizardData } from '../../components/dataLake/IcebergConnectionWizard';

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

  // ── Iceberg UI state ───────────────────────────────────────────────────
  const [icebergEditId, setIcebergEditId] = useState<string | null>(null);
  const [icebergDeleteTarget, setIcebergDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // ── React Query — DuckLake ─────────────────────────────────────────────
  const instancesQuery = useDuckLakeInstances();
  const instances = (instancesQuery.data || []).map((i) => ({
    ...i,
    type: 'duck-lake',
  }));
  const createInstanceMutation = useCreateDuckLakeInstance();
  const deleteMutation = useDeleteDuckLakeInstance();

  // ── React Query — Iceberg ──────────────────────────────────────────────
  const { data: icebergInstances = [] } = useListIcebergInstances();
  const createIcebergMutation = useCreateIcebergInstance();
  const updateIcebergMutation = useUpdateIcebergInstance();
  const deleteIcebergMutation = useDeleteIcebergInstance();
  const { data: editInstanceData, isLoading: editInstanceLoading } =
    useGetIcebergInstance(icebergEditId ?? '');
  const activeIcebergId = type === 'iceberg' ? (instanceId ?? '') : '';
  const {
    data: icebergInstance,
    isLoading: icebergDetailLoading,
    error: icebergDetailError,
  } = useGetIcebergInstance(activeIcebergId);

  // ── Install gate (FE-05 pattern) ───────────────────────────────────────
  const { isInstalling } = useEnsureIcebergInstalledOnMount();

  // ── Path parsing ───────────────────────────────────────────────────────
  const pathSegments = location.pathname.split('/');
  const currentSection = (() => {
    if (pathSegments.includes('new-instance')) return 'new-instance';
    if (pathSegments.includes('edit')) return 'edit-instance';
    if (
      pathSegments.includes('instances') &&
      pathSegments.includes('tables') &&
      pathSegments.length > 6
    ) {
      return 'table-detail';
    }
    if (pathSegments.includes('instances') && pathSegments.includes('tables')) {
      return 'instance-tables';
    }
    if (pathSegments.includes('instances') && pathSegments.length > 4) {
      return 'instance-detail';
    }
    if (pathSegments.includes('instances')) return 'instances';
    if (pathSegments.includes('tables')) return 'tables';
    if (pathSegments.includes('instance') && pathSegments.length > 4)
      return 'instance-detail';
    if (pathSegments.includes('table') && pathSegments.length > 4)
      return 'table-detail';
    return pathSegments.pop() || 'dashboard';
  })();

  // Pre-select lake type when navigating e.g. /new-instance?type=iceberg
  useEffect(() => {
    if (currentSection !== 'new-instance') return;
    const typeParam = new URLSearchParams(location.search).get('type');
    if (typeParam === 'iceberg') {
      setSelectedType('iceberg');
    }
  }, [currentSection, location.search]);

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
      disabled: false, // now enabled
      beta: true,
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

  const ConnectionCardsContainer = styled(Box)`
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 24px;
    padding: 12px 0 36px;
    max-width: 1400px;
    margin: 0 auto;
  `;

  const currentInstanceId =
    instanceId || pathSegments[pathSegments.indexOf('instance') + 1];

  const duckLakeInstanceId =
    type !== 'iceberg' && currentSection === 'instance-detail'
      ? currentInstanceId || ''
      : '';

  const instanceQuery = useDuckLakeInstance(duckLakeInstanceId);
  const currentInstance = instanceQuery.data;

  // DuckLake connection lifecycle management (skip for Iceberg instances)
  useEffect(() => {
    let acquiredInstanceId: string | null = null;

    const acquireConnectionForInstance = async () => {
      const instanceViewingSections = [
        'instance-detail',
        'instance-tables',
        'tables',
        'table-detail',
      ];

      if (
        type !== 'iceberg' &&
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

    return () => {
      if (acquiredInstanceId) {
        DuckLakeService.releaseConnection(acquiredInstanceId);
      }
    };
  }, [currentSection, instanceId, currentInstanceId, type]);

  // ── Iceberg handlers ───────────────────────────────────────────────────

  const handleIcebergWizardComplete = async (wizardData: IcebergWizardData) => {
    const dto: CreateIcebergInstanceDTO = {
      name: wizardData.basics.name,
      description: wizardData.basics.description,
      catalogType: wizardData.catalog.catalogType as IcebergCatalogType,
      catalogPath: wizardData.catalog.catalogPath,
      endpoint: wizardData.catalog.endpoint,
      catalogName: wizardData.catalog.catalogName,
      databaseConnectionId: wizardData.catalog.databaseConnectionId,
      catalogAuthMode: wizardData.catalog.authMode,
      accessToken: wizardData.catalog.accessToken,
      oauthClientId: wizardData.catalog.oauthClientId,
      oauthClientSecret: wizardData.catalog.oauthClientSecret,
      oauthServerUri: wizardData.catalog.oauthServerUri,
      oauthScope: wizardData.catalog.oauthScope,
      nessieReference: wizardData.catalog.nessieReference,
      nessieWarehouse: wizardData.catalog.nessieWarehouse,
      hiveUri: wizardData.catalog.hiveUri,
      hiveUgi: wizardData.catalog.hiveUgi,
      catalogConnectionId: wizardData.catalog.polarisConnectionId,
      catalogBucket: wizardData.catalog.polarisBucket,
      catalogPrefix: wizardData.catalog.polarisPrefix,
      storageType: wizardData.storage.storageType as IcebergStorageType,
      localPath: wizardData.storage.localPath,
      cloudProvider: wizardData.storage.cloudProvider as IcebergCloudProvider,
      storageConnectionId: wizardData.storage.connectionId,
      storageBucket: wizardData.storage.bucket,
      storagePrefix: wizardData.storage.prefix,
    };
    try {
      const created = await createIcebergMutation.mutateAsync(dto);
      setSelectedType(undefined);
      toast.success('Iceberg instance created.');
      navigate(`/app/data-lake/iceberg/instances/${created.id}`);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error(err?.message ?? 'Failed to create Iceberg instance.');
    }
  };

  const handleIcebergEditComplete = async (wizardData: IcebergWizardData) => {
    if (!icebergEditId) return;
    const dto: Partial<CreateIcebergInstanceDTO> = {
      name: wizardData.basics.name,
      description: wizardData.basics.description,
      catalogType: wizardData.catalog.catalogType as IcebergCatalogType,
      catalogPath: wizardData.catalog.catalogPath,
      endpoint: wizardData.catalog.endpoint,
      catalogName: wizardData.catalog.catalogName,
      databaseConnectionId: wizardData.catalog.databaseConnectionId,
      catalogAuthMode: wizardData.catalog.authMode,
      // Only send token if the user typed a new one; empty = preserve existing
      ...(wizardData.catalog.accessToken
        ? { accessToken: wizardData.catalog.accessToken }
        : {}),
      ...(wizardData.catalog.oauthClientSecret
        ? { oauthClientSecret: wizardData.catalog.oauthClientSecret }
        : {}),
      oauthClientId: wizardData.catalog.oauthClientId,
      oauthServerUri: wizardData.catalog.oauthServerUri,
      oauthScope: wizardData.catalog.oauthScope,
      nessieReference: wizardData.catalog.nessieReference,
      nessieWarehouse: wizardData.catalog.nessieWarehouse,
      hiveUri: wizardData.catalog.hiveUri,
      hiveUgi: wizardData.catalog.hiveUgi,
      catalogConnectionId: wizardData.catalog.polarisConnectionId,
      catalogBucket: wizardData.catalog.polarisBucket,
      catalogPrefix: wizardData.catalog.polarisPrefix,
      storageType: wizardData.storage.storageType as IcebergStorageType,
      localPath: wizardData.storage.localPath,
      cloudProvider: wizardData.storage.cloudProvider as IcebergCloudProvider,
      storageConnectionId: wizardData.storage.connectionId,
      storageBucket: wizardData.storage.bucket,
      storagePrefix: wizardData.storage.prefix,
    };
    try {
      await updateIcebergMutation.mutateAsync({ id: icebergEditId, data: dto });
      setIcebergEditId(null);
      toast.success('Iceberg instance updated.');
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error(err?.message ?? 'Failed to update Iceberg instance.');
    }
  };

  const handleIcebergDeleteConfirm = async () => {
    if (!icebergDeleteTarget) return;
    try {
      await deleteIcebergMutation.mutateAsync(icebergDeleteTarget.id);
      if (activeIcebergId === icebergDeleteTarget.id) {
        navigate('/app/data-lake/instances');
      }
      setIcebergDeleteTarget(null);
      toast.success('Iceberg instance deleted.');
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error(err?.message ?? 'Failed to delete Iceberg instance.');
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────

  const renderIcebergInstanceDetail = (inst: IcebergInstanceConfig) => (
    <IcebergDetail
      instance={inst}
      onEdit={() => setIcebergEditId(inst.id)}
      onDelete={() => setIcebergDeleteTarget({ id: inst.id, name: inst.name })}
    />
  );

  const renderContent = () => {
    switch (currentSection) {
      case 'dashboard':
        return (
          <DataLakeDashboard
            duckLakeInstances={instances as any}
            icebergInstances={icebergInstances}
          />
        );

      case 'instances':
        return (
          <DataLakeInstances onEditIceberg={(id) => setIcebergEditId(id)} />
        );

      case 'instance-tables':
        return <DataLakeTablesView instanceId={currentInstanceId || ''} />;

      case 'tables':
        if (instanceId) {
          return <DataLakeTablesView instanceId={instanceId} />;
        }
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

      case 'new-instance':
        // Step 1: type selection cards
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

        // Step 2: DuckLake wizard
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

        // Step 2: Iceberg wizard (inline, same pattern as DuckLake)
        if (selectedType === 'iceberg') {
          return (
            <IcebergConnectionWizard
              onComplete={handleIcebergWizardComplete}
              onCancel={() => {
                setSelectedType(undefined);
                navigate('/app/data-lake/new-instance');
              }}
              isLoading={createIcebergMutation.isLoading}
              mode="create"
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
        if (type === 'iceberg') {
          if (icebergDetailLoading) {
            return (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            );
          }

          if (icebergDetailError || !icebergInstance) {
            return (
              <Box sx={{ p: 2 }}>
                <Typography
                  variant="h4"
                  component="h1"
                  sx={{ fontWeight: 'bold', mb: 3 }}
                >
                  Iceberg Instance Not Found
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  The requested Iceberg instance could not be found.
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

          return renderIcebergInstanceDetail(icebergInstance);
        }

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
        return type === 'iceberg' ? (
          <IcebergTableDetails />
        ) : (
          <DataLakeTableDetails />
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
        <DataLakeSidebar
          instances={instances}
          icebergInstances={icebergInstances}
        />
      }
      panelTitle="DataLake"
    >
      <Box sx={{ p: 2 }}>
        {/* pyiceberg install banner */}
        {isInstalling && (
          <Alert
            severity="info"
            icon={<CircularProgress size={18} />}
            sx={{ mb: 2 }}
          >
            Installing pyiceberg into the managed Python environment… This may
            take a moment.
          </Alert>
        )}

        <Box>{renderContent()}</Box>
      </Box>

      {/* ── Iceberg Edit Wizard Dialog ────────────────────────────────── */}
      <Dialog
        open={!!icebergEditId}
        onClose={() => setIcebergEditId(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ pt: 3 }}>
          {editInstanceLoading || !editInstanceData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <IcebergConnectionWizard
              key={icebergEditId}
              onComplete={handleIcebergEditComplete}
              onCancel={() => setIcebergEditId(null)}
              isLoading={updateIcebergMutation.isLoading}
              mode="edit"
              initialData={editInstanceData}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Iceberg Delete Confirmation Dialog ───────────────────────── */}
      <Dialog
        open={!!icebergDeleteTarget}
        onClose={() => setIcebergDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Iceberg Instance</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete Iceberg instance <strong>{icebergDeleteTarget?.name}</strong>
            ? This cannot be undone. Keytar credentials for this instance will
            also be removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setIcebergDeleteTarget(null)}
            color="inherit"
            disabled={deleteIcebergMutation.isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleIcebergDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteIcebergMutation.isLoading}
            startIcon={
              deleteIcebergMutation.isLoading ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {deleteIcebergMutation.isLoading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppLayout>
  );
};

export default DataLake;
