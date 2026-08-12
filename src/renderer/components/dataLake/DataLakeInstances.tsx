import React, { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Edit, Delete, Folder, Storage, Refresh } from '@mui/icons-material';
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
    error: duckLakeError,
    refetch: refetchDuckLake,
  } = useDuckLakeInstances();
  const {
    data: icebergInstances = [],
    isLoading: icebergLoading,
    error: icebergError,
    refetch: refetchIceberg,
  } = useListIcebergInstances();
  const deleteDuckLakeMutation = useDeleteDuckLakeInstance();
  const deleteIcebergMutation = useDeleteIcebergInstance();

  const isLoading = duckLakeLoading || icebergLoading;
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

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load DataLake instances: {(error as Error).message}
        </Alert>
        <Button
          variant="contained"
          onClick={handleRefresh}
          startIcon={<Refresh />}
        >
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 'bold' }}>
            DataLake Instances
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your DuckLake and Apache Iceberg instances
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <IconButton
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh"
          >
            <Refresh />
          </IconButton>
        </Box>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {!isLoading && rows.length === 0 && (
        <Card sx={{ textAlign: 'center', py: 4 }}>
          <CardContent>
            <Storage sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No DataLake Instances
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create your first DataLake instance using the &quot;New
              DataLake&quot; button in the sidebar.
            </Typography>
          </CardContent>
        </Card>
      )}

      {!isLoading && rows.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>DataLake Type</TableCell>
                <TableCell>Catalog Type</TableCell>
                <TableCell>Data Path / Storage</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
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
                  <TableCell>
                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 'bold' }}
                      >
                        {row.name}
                      </Typography>
                      {row.description && (
                        <Typography variant="caption" color="text.secondary">
                          {row.description}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {row.lakeType === 'duck-lake' ? (
                      <Chip
                        icon={
                          <Box
                            component="img"
                            src={icons.duckLake}
                            alt=""
                            sx={{ width: 16, height: 16, objectFit: 'contain' }}
                          />
                        }
                        label="DuckLake"
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    ) : (
                      <Chip
                        icon={<IcebergIcon size={16} />}
                        label="Apache Iceberg"
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={
                        <Box
                          component="img"
                          src={getCatalogIcon(row)}
                          alt=""
                          sx={{ width: 16, height: 16, objectFit: 'contain' }}
                        />
                      }
                      label={row.catalogType}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell
                    sx={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getStorageIcon(row)}
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace' }}
                      >
                        {row.dataPath}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {moment(row.createdAt).format('MMM D, YYYY')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {moment(row.createdAt).fromNow()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {moment(row.updatedAt).format('MMM D, YYYY')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {moment(row.updatedAt).fromNow()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        onClick={() => handleEdit(row)}
                        title="Edit"
                      >
                        <Edit />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(row)}
                        disabled={
                          deleteDuckLakeMutation.isLoading ||
                          deleteIcebergMutation.isLoading
                        }
                        title="Delete"
                        color="error"
                      >
                        <Delete />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
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
