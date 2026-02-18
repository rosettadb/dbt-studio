import React from 'react';
import { styled } from '@mui/material/styles';
import {
  Box,
  Typography,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  CheckCircleOutline,
  Download as DownloadIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Description as JsonIcon,
  TableChart as CsvIcon,
  InsertDriveFile as ParquetIcon,
} from '@mui/icons-material';
import {
  QueryResponseType,
  SupportedConnectionTypes,
} from '../../../types/backend';
import { CustomTable } from '../../components/customTable';
import { underscoreToTitleCase } from '../../helpers/utils';

const SuccessContainer = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(2),
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  boxShadow: theme.shadows[2],
  margin: theme.spacing(2, 0),
  width: '100%',
}));

const IconWrapper = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '2rem',
}));

type Props = {
  results: QueryResponseType;
  exportContext?: {
    connectionType: SupportedConnectionTypes;
    connectionId?: string;
    duckLakeInstanceId?: string;
    originalSql?: string;
  };
};

export const QueryResult: React.FC<Props> = ({ results, exportContext }) => {
  const columns = React.useMemo(() => {
    return results.fields?.map((field) => field.name) ?? [];
  }, [results]);

  const rows = React.useMemo(() => {
    return results.data ?? [];
  }, [results]);

  const hasRows = rows.length > 0 && columns.length > 0;

  const [exportAnchorEl, setExportAnchorEl] =
    React.useState<null | HTMLElement>(null);
  const exportMenuOpen = Boolean(exportAnchorEl);

  const handleExportMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setExportAnchorEl(event.currentTarget);
  };

  const handleExportMenuClose = () => {
    setExportAnchorEl(null);
  };

  const handleDownloadJson = () => {
    if (!hasRows) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_results.json';
    a.click();
    window.URL.revokeObjectURL(url);
    handleExportMenuClose();
  };

  const handleDownloadCsv = () => {
    if (!hasRows) return;

    const escapeCsvValue = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = columns.join(',');
    const dataRows = rows.map((row: any) =>
      columns.map((col) => escapeCsvValue(row[col])).join(','),
    );
    const csvContent = [header, ...dataRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_results.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    handleExportMenuClose();
  };

  const canExportParquet =
    !!exportContext &&
    !!exportContext.originalSql &&
    (exportContext.connectionType === 'duckdb' ||
      exportContext.connectionType === 'ducklake');

  const handleExportParquet = async () => {
    if (!canExportParquet || !exportContext?.originalSql) return;

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'dialog:showSaveDialog',
        {
          title: 'Export to Parquet',
          defaultPath: 'query_results.parquet',
          filters: [{ name: 'Parquet Files', extensions: ['parquet'] }],
        },
      );

      if (result.canceled || !result.filePath) {
        handleExportMenuClose();
        return;
      }

      const escapedPath = result.filePath.replace(/'/g, "''");
      const exportQuery = `COPY (${exportContext.originalSql}) TO '${escapedPath}' (FORMAT PARQUET)`;

      if (
        exportContext.connectionType === 'ducklake' &&
        exportContext.duckLakeInstanceId
      ) {
        await window.electron.ipcRenderer.invoke('ducklake:query:execute', {
          instanceId: exportContext.duckLakeInstanceId,
          query: exportQuery,
        });
      } else if (
        exportContext.connectionType === 'duckdb' &&
        exportContext.connectionId
      ) {
        await window.electron.ipcRenderer.invoke('connector:executeQuery', {
          connectionId: exportContext.connectionId,
          query: exportQuery,
        });
      }

      handleExportMenuClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Parquet export error:', error);
      handleExportMenuClose();
    }
  };

  // Use isCommand flag if available, otherwise fallback to field check
  const isCommand =
    results.isCommand ||
    ((!results.fields || results.fields.length === 0) && results.success);

  // Show row count for DML or generic commands with rowCount > 0
  const showRowCount =
    results.commandType === 'DML' ||
    (results.commandType !== 'DDL' &&
      results.rowCount !== undefined &&
      results.rowCount > 0);

  if (isCommand) {
    return (
      <SuccessContainer data-testid="sql-results-pane">
        <IconWrapper>
          <CheckCircleOutline fontSize="large" color="success" />
        </IconWrapper>
        <Box>
          <Typography variant="h6" fontWeight="bold">
            Command executed successfully
          </Typography>
          {showRowCount && results.rowCount !== undefined && (
            <Typography variant="body2">
              {`${results.rowCount} row${
                results.rowCount !== 1 ? 's' : ''
              } affected`}
            </Typography>
          )}
          {results.duration !== undefined && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
              Duration:{' '}
              {results.duration! > 1000
                ? `${(results.duration! / 1000).toFixed(2)}s`
                : `${results.duration!}ms`}
            </Typography>
          )}
        </Box>
      </SuccessContainer>
    );
  }

  return (
    <div data-testid="sql-results-pane">
      <CustomTable<Record<string, any>>
        id="query-result"
        dataTestId="sql-results-table"
        name=""
        toolbarContent={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {results.duration !== undefined && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ opacity: 0.7 }}
              >
                {results.duration > 1000
                  ? `${(results.duration / 1000).toFixed(2)}s`
                  : `${results.duration}ms`}
              </Typography>
            )}
            <Tooltip
              title={hasRows ? 'Export query results' : 'No data to export'}
            >
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon />}
                  endIcon={<ArrowDropDownIcon />}
                  onClick={handleExportMenuOpen}
                  disabled={!hasRows}
                >
                  Export
                </Button>
              </span>
            </Tooltip>
            <Menu
              anchorEl={exportAnchorEl}
              open={exportMenuOpen}
              onClose={handleExportMenuClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
            >
              <MenuItem
                onClick={handleDownloadJson}
                dense
                sx={{ py: 0.5, minHeight: 32 }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <JsonIcon sx={{ fontSize: 16 }} />
                </ListItemIcon>
                <ListItemText
                  primary="Download JSON"
                  primaryTypographyProps={{
                    variant: 'body2',
                    sx: { fontSize: 12 },
                  }}
                />
              </MenuItem>
              <MenuItem
                onClick={handleDownloadCsv}
                dense
                sx={{ py: 0.5, minHeight: 32 }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <CsvIcon sx={{ fontSize: 16 }} />
                </ListItemIcon>
                <ListItemText
                  primary="Download CSV"
                  primaryTypographyProps={{
                    variant: 'body2',
                    sx: { fontSize: 12 },
                  }}
                />
              </MenuItem>
              {canExportParquet && (
                <MenuItem
                  onClick={handleExportParquet}
                  dense
                  sx={{ py: 0.5, minHeight: 32 }}
                >
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <ParquetIcon sx={{ fontSize: 16 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Export Parquet (DuckDB/DuckLake)"
                    primaryTypographyProps={{
                      variant: 'body2',
                      sx: { fontSize: 12 },
                    }}
                  />
                </MenuItem>
              )}
            </Menu>
          </Box>
        }
        rows={rows as any}
        columns={columns.map((column) => ({
          id: column,
          label: underscoreToTitleCase(column),
          render: (value) => (
            <div
              style={{
                whiteSpace: 'nowrap',
                minHeight: '24px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {JSON.stringify(value[column]).replace(/"/g, '')}
            </div>
          ),
        }))}
      />
    </div>
  );
};
