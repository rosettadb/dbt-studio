import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
} from '@mui/material';
import { TableChart, Visibility, QueryStats } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';

interface DuckLakeTable {
  id: string;
  name: string;
  instanceId: string;
  instanceName: string;
  schema?: string;
  rowCount?: number;
  sizeBytes?: number;
  lastAccessed?: string;
  createdAt: string;
}

interface DuckLakeTablesProps {
  tables?: DuckLakeTable[];
  selectedInstanceId?: string;
  onPreview?: (tableId: string) => void;
  onQuery?: (tableId: string) => void;
}

export const DuckLakeTables: React.FC<DuckLakeTablesProps> = ({
  tables = [],
  selectedInstanceId,
  onPreview,
  onQuery,
}) => {
  const navigate = useNavigate();

  const filteredTables = selectedInstanceId
    ? tables.filter((table) => table.instanceId === selectedInstanceId)
    : tables;

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
  };

  const formatRowCount = (count?: number) => {
    if (!count) return 'Unknown';
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const handlePreview = (tableId: string) => {
    if (onPreview) {
      onPreview(tableId);
    }
  };

  const handleQuery = (tableId: string) => {
    if (onQuery) {
      onQuery(tableId);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
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
            Tables
          </Typography>
          <TableChart sx={{ color: 'text.secondary', fontSize: 28 }} />
        </Box>
        {selectedInstanceId && (
          <Chip
            label={`ducklakes: ${tables.find((t) => t.instanceId === selectedInstanceId)?.instanceName || selectedInstanceId}`}
            variant="outlined"
            color="primary"
          />
        )}
      </Box>

      {filteredTables.length === 0 ? (
        <Card
          sx={{
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            textAlign: 'center',
            py: 4,
          }}
        >
          <CardContent>
            <TableChart sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
              No Tables Found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {selectedInstanceId
                ? 'No tables found in the selected ducklakes. Create some tables or connect to a different ducklakes.'
                : 'No tables found across all ducklakes. Create some tables to get started.'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderRadius: 2,
          }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Table Name</TableCell>
                <TableCell>Schema</TableCell>
                <TableCell>Rows</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Last Accessed</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTables.map((table) => (
                <TableRow
                  key={table.id}
                  sx={{
                    '&:hover': {
                      backgroundColor: 'action.hover',
                      cursor: 'pointer',
                    },
                  }}
                  onClick={() => navigate(`/app/duck-lake/table/${table.id}`)}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TableChart
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {table.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {table.schema || 'main'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatRowCount(table.rowCount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatBytes(table.sizeBytes)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {table.lastAccessed
                        ? moment(table.lastAccessed).fromNow()
                        : 'Never'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {moment(table.createdAt).fromNow()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreview(table.id);
                        }}
                        title="Preview Data"
                      >
                        <Visibility fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuery(table.id);
                        }}
                        title="Query Table"
                      >
                        <QueryStats fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};
