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
  Circle,
  Add,
} from '@mui/icons-material';

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

interface DuckLakeDashboardProps {
  instances?: DuckLakeInstance[];
  recentQueries?: Array<{
    id: string;
    query: string;
    instanceId: string;
    instanceName: string;
    executedAt: string;
    duration: number;
  }>;
  recentTables?: Array<{
    id: string;
    name: string;
    instanceId: string;
    instanceName: string;
    accessedAt: string;
    rowCount?: number;
  }>;
}

export const DuckLakeDashboard: React.FC<DuckLakeDashboardProps> = ({
  instances = [],
  recentQueries = [],
  recentTables = [],
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
      totalQueries: recentQueries.length,
      totalTables: recentTables.length,
    };
  }, [instances, recentQueries, recentTables]);

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

  const getStatusIcon = (status: string) => {
    let color = 'grey.500';
    if (status === 'active') {
      color = 'success.main';
    } else if (status === 'error') {
      color = 'error.main';
    }
    return <Circle sx={{ fontSize: 12, color }} />;
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header with title and manage instances button */}
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
          Manage Instances
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
                  Total Instances
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
              {stats.totalQueries}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Queries executed recently
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
              {stats.totalTables}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tables accessed recently
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
                <Typography key={type} variant="body2" color="text.secondary">
                  {count} {type.toUpperCase()}{' '}
                  {count === 1 ? 'catalog' : 'catalogs'}
                </Typography>
              ))}
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
        {/* Recent Instances */}
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
                    Recent Instances
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recently updated instances
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
                  No instances created yet
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
                        {getStatusIcon(instance.status)}
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
              View All Instances
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
                    Recently executed queries
                  </Typography>
                </Box>
                <QueryStats sx={{ color: 'text.secondary', fontSize: 24 }} />
              </Box>
            }
          />
          <CardContent
            sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <Box sx={{ flex: 1, mb: 2 }}>
              {recentQueries.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recent queries
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {recentQueries.slice(0, 5).map((query) => (
                    <Box
                      key={query.id}
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
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <QueryStats
                          sx={{ fontSize: 16, color: 'text.secondary' }}
                        />
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              fontFamily: 'monospace',
                              maxWidth: '200px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {query.query}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {query.instanceName} • {query.duration}ms
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {moment(query.executedAt).fromNow()}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate('/app/duck-lake/history')}
              fullWidth
            >
              View Query History
            </Button>
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
              subheader="Get started by creating your first DuckLake instance"
            />
            <CardContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                DuckLake allows you to create and manage DuckDB instances with
                various catalog backends including DuckDB, SQLite, and
                PostgreSQL. Start by creating your first instance.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<Add />}
                onClick={() => navigate('/app/duck-lake/new-instance')}
              >
                Create Instance
              </Button>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};
