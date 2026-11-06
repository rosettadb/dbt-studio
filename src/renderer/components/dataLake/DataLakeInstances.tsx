import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Edit,
  Delete,
  Folder,
  Storage,
  Refresh,
  Visibility,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import {
  useDuckLakeInstances,
  useDeleteDuckLakeInstance,
} from '../../controllers/duckLake.controller';
import {
  useListIcebergInstances,
  useDeleteIcebergInstance,
} from '../../controllers/icebergDatalake.controller';
import { ConfirmationModal } from '../modals/confirmationModal';
import type { IcebergInstanceListItem } from '../../../types/iceberg';
import { IcebergIcon } from './iceberg/IcebergIcon';
import {
  cloudStorageImages,
  databaseIcons,
  genericCatalogImage,
  icebergCatalogImages,
} from '../../../../assets/connectionIcons';
import { icons } from '../../../../assets/icons';
import {
  SettingsRefreshButton,
  SettingsSection,
} from '../settings/SettingsLayout';
import {
  DataLakePageHeader,
  DataLakeRowActions,
  DataLakeTableContainer,
  dataLakeContentSx,
} from './DataLakeLayout';

const iconLabelSx = { display: 'flex', alignItems: 'center', gap: 1 } as const;
const imageIconSx = {
  width: 16,
  height: 16,
  objectFit: 'contain',
  flexShrink: 0,
} as const;

type DataLakeTableRow =
  | {
      id: string;
      name: string;
      description?: string;
      lakeType: 'duck-lake';
      catalogType: string;
      dataPath: string;
      createdAt: string;
      updatedAt: string;
    }
  | {
      id: string;
      name: string;
      description?: string;
      lakeType: 'iceberg';
      catalogType: string;
      dataPath: string;
      createdAt: string;
      updatedAt: string;
      icebergInstance: IcebergInstanceListItem;
    };

const getCatalogIcon = (row: DataLakeTableRow) => {
  if (row.lakeType === 'duck-lake') return databaseIcons.duckdb;
  return (
    icebergCatalogImages[
      row.catalogType.toLowerCase() as keyof typeof icebergCatalogImages
    ] ?? genericCatalogImage
  );
};

const getStorageIcon = (row: DataLakeTableRow) => {
  const path = row.dataPath.toLowerCase();
  let icon;
  if (!icon && path.startsWith('s3://')) icon = cloudStorageImages.s3;
  if (!icon && path.startsWith('gs://')) icon = cloudStorageImages.gcs;
  if (!icon && path.startsWith('abfss://')) icon = cloudStorageImages.azure;

  if (icon) {
    return (
      <Box
        component="img"
        src={icon}
        alt=""
        sx={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }}
      />
    );
  }
  if (path === 'server-managed') {
    return <Storage sx={{ fontSize: 16, color: 'text.secondary' }} />;
  }
  return <Folder sx={{ fontSize: 16, color: 'text.secondary' }} />;
};

interface DataLakeInstancesProps {
  onInstanceSelect?: (instanceId: string) => void;
  onEditIceberg?: (instanceId: string) => void;
}

export const DataLakeInstances: React.FC<DataLakeInstancesProps> = ({
  onInstanceSelect,
  onEditIceberg,
}) => {
  const navigate = useNavigate();
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    instanceId: string | null;
    instanceName: string | null;
    lakeType: 'duck-lake' | 'iceberg' | null;
  }>({
    isOpen: false,
    instanceId: null,
    instanceName: null,
    lakeType: null,
  });

  const {
    data: duckLakeInstances = [],
    isLoading: duckLakeLoading,
    isFetching: duckLakeFetching,
    error: duckLakeError,
    refetch: refetchDuckLake,
  } = useDuckLakeInstances();
  const {
    data: icebergInstances = [],
    isLoading: icebergLoading,
    isFetching: icebergFetching,
    error: icebergError,
    refetch: refetchIceberg,
  } = useListIcebergInstances();
  const deleteDuckLakeMutation = useDeleteDuckLakeInstance();
  const deleteIcebergMutation = useDeleteIcebergInstance();

  const isLoading = duckLakeLoading || icebergLoading;
  const isFetching = duckLakeFetching || icebergFetching;
  const error = duckLakeError || icebergError;

  const rows = useMemo<DataLakeTableRow[]>(() => {
    const duckRows: DataLakeTableRow[] = duckLakeInstances.map((instance) => ({
      id: instance.id,
      name: instance.name,
      description: instance.description,
      lakeType: 'duck-lake',
      catalogType: instance.catalog.type.toUpperCase(),
      dataPath: instance.dataPath,
      createdAt: new Date(instance.createdAt).toISOString(),
      updatedAt: new Date(instance.updatedAt).toISOString(),
    }));

    const icebergRows: DataLakeTableRow[] = icebergInstances.map(
      (instance) => ({
        id: instance.id,
        name: instance.name,
        description: instance.description,
        lakeType: 'iceberg',
        catalogType: instance.catalogType.toUpperCase(),
        dataPath:
          instance.localPath ||
          instance.catalogPath ||
          instance.storageBucket ||
          instance.storageType,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
        icebergInstance: instance,
      }),
    );

    return [...duckRows, ...icebergRows].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [duckLakeInstances, icebergInstances]);

  const handleDelete = (row: DataLakeTableRow) => {
    setDeleteConfirmation({
      isOpen: true,
      instanceId: row.id,
      instanceName: row.name,
      lakeType: row.lakeType,
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmation.instanceId || !deleteConfirmation.lakeType) return;

    if (deleteConfirmation.lakeType === 'duck-lake') {
      deleteDuckLakeMutation.mutate(deleteConfirmation.instanceId);
    } else {
      deleteIcebergMutation.mutate(deleteConfirmation.instanceId);
    }

    setDeleteConfirmation({
      isOpen: false,
      instanceId: null,
      instanceName: null,
      lakeType: null,
    });
  };

  const handleCancelDelete = () => {
    setDeleteConfirmation({
      isOpen: false,
      instanceId: null,
      instanceName: null,
      lakeType: null,
    });
  };

  const handleEdit = (row: DataLakeTableRow) => {
    if (row.lakeType === 'duck-lake') {
      navigate(`/app/data-lake/duck-lake/instances/${row.id}/edit`);
      return;
    }
    onEditIceberg?.(row.id);
  };

  const handleInstanceClick = (row: DataLakeTableRow) => {
    if (row.lakeType === 'duck-lake') {
      if (onInstanceSelect) {
        onInstanceSelect(row.id);
      } else {
        navigate(`/app/data-lake/duck-lake/instances/${row.id}`);
      }
      return;
    }
    navigate(`/app/data-lake/iceberg/instances/${row.id}`);
  };

  const handleRefresh = () => {
    refetchDuckLake();
    refetchIceberg();
  };

  const header = (
    <DataLakePageHeader
      title="DataLake Instances"
      description="Manage your DuckLake and Apache Iceberg instances"
      actions={
        <SettingsRefreshButton
          title="Refresh instances"
          onClick={handleRefresh}
          loading={isFetching}
        />
      }
    />
  );

  if (error) {
    return (
      <Box sx={dataLakeContentSx}>
        {header}
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load DataLake instances: {(error as Error).message}
        </Alert>
        <Button
          size="small"
          variant="outlined"
          onClick={handleRefresh}
          startIcon={<Refresh />}
        >
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={dataLakeContentSx}>
      {header}

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {!isLoading && rows.length === 0 && (
        <SettingsSection title="Instances" icon={<Storage />}>
          <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
            <Storage sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="subtitle2" component="h2" gutterBottom>
              No DataLake Instances
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create your first DataLake instance using the &quot;New
              DataLake&quot; button in the sidebar.
            </Typography>
          </Box>
        </SettingsSection>
      )}

      {!isLoading && rows.length > 0 && (
        <SettingsSection
          title="Instances"
          icon={<Storage />}
          description={`${rows.length} ${rows.length === 1 ? 'instance' : 'instances'}`}
        >
          <DataLakeTableContainer bordered={false}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Catalog</TableCell>
                  <TableCell>Data Path / Storage</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Last Updated</TableCell>
                  <TableCell
                    align="right"
                    aria-label="Actions"
                    sx={{ width: 48 }}
                  />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={`${row.lakeType}-${row.id}`}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => handleInstanceClick(row)}
                  >
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {row.name}
                      </Typography>
                      {row.description && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="div"
                          noWrap
                          title={row.description}
                        >
                          {row.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={iconLabelSx}>
                        {row.lakeType === 'duck-lake' ? (
                          <Box
                            component="img"
                            src={icons.duckLake}
                            alt=""
                            sx={imageIconSx}
                          />
                        ) : (
                          <IcebergIcon size={16} />
                        )}
                        {row.lakeType === 'duck-lake'
                          ? 'DuckLake'
                          : 'Apache Iceberg'}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={iconLabelSx}>
                        <Box
                          component="img"
                          src={getCatalogIcon(row)}
                          alt=""
                          sx={imageIconSx}
                        />
                        {row.catalogType}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Box sx={iconLabelSx}>
                        {getStorageIcon(row)}
                        <Typography
                          variant="body2"
                          noWrap
                          title={row.dataPath}
                          sx={{ fontFamily: 'monospace', fontSize: 12 }}
                        >
                          {row.dataPath}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{ whiteSpace: 'nowrap' }}
                      title={moment(row.createdAt).format('LLL')}
                    >
                      {moment(row.createdAt).format('MMM D, YYYY')}
                    </TableCell>
                    <TableCell
                      sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}
                      title={moment(row.updatedAt).format('LLL')}
                    >
                      {moment(row.updatedAt).fromNow()}
                    </TableCell>
                    <TableCell align="right">
                      <DataLakeRowActions
                        label={`Actions for ${row.name}`}
                        actions={[
                          {
                            key: 'open',
                            label: 'View details',
                            icon: <Visibility fontSize="small" />,
                            onClick: () => handleInstanceClick(row),
                          },
                          {
                            key: 'edit',
                            label: 'Edit',
                            icon: <Edit fontSize="small" />,
                            onClick: () => handleEdit(row),
                          },
                          {
                            key: 'delete',
                            label: 'Delete',
                            icon: <Delete fontSize="small" />,
                            onClick: () => handleDelete(row),
                            disabled:
                              deleteDuckLakeMutation.isLoading ||
                              deleteIcebergMutation.isLoading,
                            danger: true,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataLakeTableContainer>
        </SettingsSection>
      )}

      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Delete DataLake Instance"
        question={`Are you sure you want to delete "${deleteConfirmation.instanceName}"? This action cannot be undone.`}
      />
    </Box>
  );
};
