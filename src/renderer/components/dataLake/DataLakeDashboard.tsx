import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
} from '@mui/material';
import {
  Storage,
  TableChart,
  QueryStats,
  Settings,
  Dashboard,
  Add,
  Folder,
} from '@mui/icons-material';
import { IcebergIcon } from './iceberg/IcebergIcon';
import {
  cloudStorageImages,
  databaseIcons,
} from '../../../../assets/connectionIcons';
import { icons } from '../../../../assets/icons';
import { DataLakeSVG } from '../sidebar/icons';
import type { IcebergInstanceListItem } from '../../../types/iceberg';

interface DuckLakeInstance {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  dataPath: string;
  catalog: {
    type: string;
  };
  createdAt: string;
  updatedAt: string;
}

type RecentDataLakeItem =
  | {
      id: string;
      name: string;
      lakeType: 'duck-lake';
      catalogLabel: string;
      dataPath: string;
      updatedAt: string;
    }
  | {
      id: string;
      name: string;
      lakeType: 'iceberg';
      catalogLabel: string;
      dataPath: string;
      updatedAt: string;
    };

const getStorageIconForInstance = (dataPath: string) => {
  if (dataPath.startsWith('s3://')) {
    return (
      <Box
        component="img"
        src={cloudStorageImages.s3}
        alt="AWS S3"
        sx={{ width: 20, height: 20 }}
      />
    );
  }
  if (dataPath.startsWith('gs://')) {
    return (
      <Box
        component="img"
        src={cloudStorageImages.gcs}
        alt="Google Cloud Storage"
        sx={{ width: 20, height: 20 }}
      />
    );
  }
  if (dataPath.startsWith('abfss://')) {
    return (
      <Box
        component="img"
        src={cloudStorageImages.azure}
        alt="Azure Blob Storage"
        sx={{ width: 20, height: 20 }}
      />
    );
  }
  return <Folder fontSize="small" />;
};

interface DataLakeDashboardProps {
  duckLakeInstances?: DuckLakeInstance[];
  icebergInstances?: IcebergInstanceListItem[];
}

export const DataLakeDashboard: React.FC<DataLakeDashboardProps> = ({
  duckLakeInstances = [],
  icebergInstances = [],
}) => {
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const duckLakeCatalogTypes = duckLakeInstances.reduce(
      (acc, instance) => {
        acc[instance.catalog.type] = (acc[instance.catalog.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const icebergCatalogTypes = icebergInstances.reduce(
      (acc, instance) => {
        const key = `iceberg-${instance.catalogType}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const catalogTypes = { ...duckLakeCatalogTypes, ...icebergCatalogTypes };

    const recentItems: RecentDataLakeItem[] = [
      ...duckLakeInstances.map((instance) => ({
        id: instance.id,
        name: instance.name,
        lakeType: 'duck-lake' as const,
        catalogLabel: instance.catalog.type.toUpperCase(),
        dataPath: instance.dataPath,
        updatedAt: instance.updatedAt,
      })),
      ...icebergInstances.map((instance) => ({
        id: instance.id,
        name: instance.name,
        lakeType: 'iceberg' as const,
        catalogLabel: instance.catalogType.toUpperCase(),
        dataPath:
          instance.localPath ||
          instance.catalogPath ||
          instance.storageBucket ||
          instance.storageType,
        updatedAt: instance.updatedAt,
      })),
    ].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return {
      duckLakeCount: duckLakeInstances.length,
      icebergCount: icebergInstances.length,
      totalInstances: duckLakeInstances.length + icebergInstances.length,
      catalogTypes,
      recentItems,
    };
  }, [duckLakeInstances, icebergInstances]);

  const getCatalogIcon = (type: string) => {
    if (type.startsWith('iceberg-')) {
      return <IcebergIcon size={16} />;
    }

    let iconSrc;
    switch (type.toLowerCase()) {
      case 'duckdb':
        iconSrc = databaseIcons.duckdb;
        break;
      case 'sqlite':
        iconSrc = databaseIcons.sqlite;
        break;
      case 'postgres':
      case 'postgresql':
        iconSrc = databaseIcons.postgresql;
        break;
      default:
        iconSrc = databaseIcons.duckdb;
    }
    return (
      <Box
        component="img"
        src={iconSrc}
        alt={type}
        sx={{ width: 16, height: 16, mr: 0.5 }}
      />
    );
  };

  const getCatalogLabel = (type: string, count: number) => {
    if (type.startsWith('iceberg-')) {
      const catalogType = type.replace('iceberg-', '').toUpperCase();
      return `${count} Iceberg ${catalogType} ${count === 1 ? 'catalog' : 'catalogs'}`;
    }
    return `${count} ${type.toUpperCase()} ${count === 1 ? 'catalog' : 'catalogs'}`;
  };

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
            DataLake Dashboard
          </Typography>
          <Dashboard sx={{ color: 'text.secondary', fontSize: 28 }} />
        </Box>
        <Button
          variant="outlined"
          startIcon={<Settings />}
          onClick={() => navigate('/app/data-lake/instances')}
        >
          Manage DataLakes
        </Button>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 3,
        }}
      >
        <Card
          sx={{
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardHeader
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Total DataLakes
                </Typography>
                <DataLakeSVG width={24} height={24} />
              </Box>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ pt: 0 }}>
            <Typography
              variant="h4"
              component="div"
              sx={{ fontWeight: 'bold', mb: 2 }}
            >
              {stats.totalInstances}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DataLakeSVG width={16} height={16} />
                  <Typography variant="body2" color="text.secondary">
                    DuckLake
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {stats.duckLakeCount}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    component="img"
                    src={icons.apacheIcebergLake}
                    alt="Apache Iceberg"
                    sx={{
                      width: 16,
                      height: 16,
                      opacity: stats.icebergCount > 0 ? 1 : 0.4,
                    }}
                  />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ opacity: stats.icebergCount > 0 ? 1 : 0.6 }}
                  >
                    Apache Iceberg
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: stats.icebergCount > 0 ? 500 : undefined,
                    opacity: stats.icebergCount > 0 ? 1 : 0.6,
                  }}
                >
                  {stats.icebergCount}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    component="img"
                    src={icons.deltaLake}
                    alt="Delta Lake"
                    sx={{ width: 16, height: 16, opacity: 0.4 }}
                  />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ opacity: 0.6 }}
                  >
                    Delta Lake
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ opacity: 0.6 }}
                >
                  0
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    component="img"
                    src={icons.apacheHudiLake}
                    alt="Apache Hudi"
                    sx={{ width: 16, height: 16, opacity: 0.4 }}
                  />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ opacity: 0.6 }}
                  >
                    Apache Hudi
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ opacity: 0.6 }}
                >
                  0
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card
          sx={{
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardHeader
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Recent Queries
                </Typography>
                <QueryStats sx={{ color: 'text.secondary', fontSize: 20 }} />
              </Box>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ pt: 0 }}>
            <Typography
              variant="h4"
              component="div"
              sx={{ fontWeight: 'bold' }}
            >
              0
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Coming soon
            </Typography>
          </CardContent>
        </Card>

        <Card
          sx={{
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardHeader
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Tables Accessed
                </Typography>
                <TableChart sx={{ color: 'text.secondary', fontSize: 20 }} />
              </Box>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ pt: 0 }}>
            <Typography
              variant="h4"
              component="div"
              sx={{ fontWeight: 'bold' }}
            >
              0
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Coming soon
            </Typography>
          </CardContent>
        </Card>

        <Card
          sx={{
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardHeader
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Catalog Types
                </Typography>
                <Storage sx={{ color: 'text.secondary', fontSize: 20 }} />
              </Box>
            }
            sx={{ pb: 1 }}
          />
          <CardContent sx={{ pt: 0 }}>
            <Typography
              variant="h4"
              component="div"
              sx={{ fontWeight: 'bold' }}
            >
              {Object.keys(stats.catalogTypes).length}
            </Typography>
            <Box
              sx={{
                mt: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
              }}
            >
              {Object.entries(stats.catalogTypes).map(([type, count]) => (
                <Box key={type} sx={{ display: 'flex', alignItems: 'center' }}>
                  {getCatalogIcon(type)}
                  <Typography variant="body2" color="text.secondary">
                    {getCatalogLabel(type, count)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 3,
          mt: 3,
        }}
      >
        <Card
          sx={{
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardHeader
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="h6" component="h2">
                    Recent DataLakes
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recently updated DataLakes
                  </Typography>
                </Box>
                <DataLakeSVG width={24} height={24} />
              </Box>
            }
          />
          <CardContent
            sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <Box sx={{ flex: 1, mb: 2 }}>
              {stats.recentItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No DataLakes created yet
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {stats.recentItems.slice(0, 5).map((instance) => (
                    <Box
                      key={`${instance.lakeType}-${instance.id}`}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        p: 1,
                        borderRadius: 1,
                        '&:hover': {
                          backgroundColor: 'action.hover',
                        },
                      }}
                      onClick={() =>
                        navigate(
                          instance.lakeType === 'iceberg'
                            ? `/app/data-lake/iceberg/instances/${instance.id}`
                            : `/app/data-lake/duck-lake/instances/${instance.id}`,
                        )
                      }
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        {instance.lakeType === 'iceberg' ? (
                          <IcebergIcon size={18} />
                        ) : (
                          getStorageIconForInstance(instance.dataPath)
                        )}
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {instance.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {instance.catalogLabel} catalog
                          </Typography>
                        </Box>
                      </Box>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        {instance.lakeType === 'iceberg' ? (
                          <Box
                            component="img"
                            src={icons.apacheIcebergLake}
                            alt="Apache Iceberg"
                            sx={{ width: 16, height: 16 }}
                            title="Apache Iceberg"
                          />
                        ) : (
                          <Box
                            component="img"
                            src={icons.duckLake}
                            alt="DuckLake"
                            sx={{ width: 16, height: 16 }}
                            title="DuckLake"
                          />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {moment(instance.updatedAt).fromNow()}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate('/app/data-lake/instances')}
              fullWidth
            >
              View all DataLakes
            </Button>
          </CardContent>
        </Card>

        <Card
          sx={{
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardHeader
            title={
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="h6" component="h2">
                    Recent Queries
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Coming soon
                  </Typography>
                </Box>
                <QueryStats sx={{ color: 'text.secondary', fontSize: 24 }} />
              </Box>
            }
          />
          <CardContent
            sx={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '200px',
            }}
          >
            <Typography
              variant="h6"
              color="text.secondary"
              sx={{ fontWeight: 500, textAlign: 'center' }}
            >
              Coming Soon
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1, textAlign: 'center' }}
            >
              Query history tracking is not yet implemented
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {stats.totalInstances === 0 && (
        <Box sx={{ mt: 3 }}>
          <Card
            sx={{
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            <CardHeader
              title={
                <Typography variant="h6" component="h2">
                  Welcome to DataLake
                </Typography>
              }
              subheader="Get started by creating your first DataLake"
            />
            <CardContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                DataLake allows you to create and manage DuckLake and Apache
                Iceberg instances. Start by creating your first DataLake.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<Add />}
                onClick={() => navigate('/app/data-lake/new-instance')}
              >
                Create DataLake
              </Button>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};
