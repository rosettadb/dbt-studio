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
  Chip,
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
import {
  cloudStorageImages,
  databaseIcons,
} from '../../../../assets/connectionIcons';

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

interface DuckLakeDashboardProps {
  instances?: DuckLakeInstance[];
}

export const DuckLakeDashboard: React.FC<DuckLakeDashboardProps> = ({
  instances = [],
}) => {
  const navigate = useNavigate();

  // Calculate statistics
  const stats = useMemo(() => {
    const activeInstances = instances.filter(
      (i) => i.status === 'active',
    ).length;
    const totalInstances = instances.length;
    const catalogTypes = instances.reduce(
      (acc, instance) => {
        acc[instance.catalog.type] = (acc[instance.catalog.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      activeInstances,
      totalInstances,
      catalogTypes,
    };
  }, [instances]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header with title and manage ducklakes button */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
            DuckLake Dashboard
          </Typography>
          <Dashboard sx={{ color: 'text.secondary', fontSize: 28 }} />
        </Box>
        <Button
          variant="outlined"
          startIcon={<Settings />}
          onClick={() => navigate('/app/duck-lake/instances')}
        >
          Manage ducklakes
        </Button>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 3,
        }}
      >
        {/* Statistics Cards */}
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
                  Total ducklakes
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
              {stats.totalInstances}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {stats.activeInstances} active,{' '}
              {stats.totalInstances - stats.activeInstances} inactive
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
              {Object.entries(stats.catalogTypes).map(([type, count]) => {
                const getCatalogIcon = () => {
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
                return (
                  <Box
                    key={type}
                    sx={{ display: 'flex', alignItems: 'center' }}
                  >
                    {getCatalogIcon()}
                    <Typography variant="body2" color="text.secondary">
                      {count} {type.toUpperCase()}{' '}
                      {count === 1 ? 'catalog' : 'catalogs'}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Recent Activity */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 3,
          mt: 3,
        }}
      >
        {/* Recent ducklakes */}
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
                    Recent ducklakes
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recently updated ducklakes
                  </Typography>
                </Box>
                <Storage sx={{ color: 'text.secondary', fontSize: 24 }} />
              </Box>
            }
          />
          <CardContent
            sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <Box sx={{ flex: 1, mb: 2 }}>
              {instances.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No ducklakes created yet
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {instances.slice(0, 5).map((instance) => (
                    <Box
                      key={instance.id}
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
                        navigate(`/app/duck-lake/instance/${instance.id}`)
                      }
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        {getStorageIconForInstance(instance.dataPath)}
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {instance.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {instance.catalog.type.toUpperCase()} catalog
                          </Typography>
                        </Box>
                      </Box>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Chip
                          label={instance.status}
                          size="small"
                          color={getStatusColor(instance.status) as any}
                          variant="outlined"
                        />
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
              onClick={() => navigate('/app/duck-lake/instances')}
              fullWidth
            >
              View all ducklakes
            </Button>
          </CardContent>
        </Card>

        {/* Recent Queries */}
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
              sx={{
                fontWeight: 500,
                textAlign: 'center',
              }}
            >
              Coming Soon
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 1,
                textAlign: 'center',
              }}
            >
              Query history tracking is not yet implemented
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Welcome Card for New Users */}
      {instances.length === 0 && (
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
                  Welcome to DuckLake
                </Typography>
              }
              subheader="Get started by creating your first DuckLake ducklakes"
            />
            <CardContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                DuckLake allows you to create and manage DuckDB ducklakes with
                various catalog backends including DuckDB, SQLite, and
                PostgreSQL. Start by creating your first ducklakes.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<Add />}
                onClick={() => navigate('/app/duck-lake/new-instance')}
              >
                Create ducklakes
              </Button>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};
