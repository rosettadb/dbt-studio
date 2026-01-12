import React from 'react';
import { styled } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import { CheckCircleOutline } from '@mui/icons-material';
import { QueryResponseType } from '../../../types/backend';
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
};

export const QueryResult: React.FC<Props> = ({ results }) => {
  const columns = React.useMemo(() => {
    return results.fields?.map((field) => field.name) ?? [];
  }, [results]);

  const rows = React.useMemo(() => {
    return results.data ?? [];
  }, [results]);

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
      <SuccessContainer>
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
    <CustomTable<Record<string, any>>
      id="query-result"
      name=""
      toolbarContent={
        results.duration !== undefined ? (
          <span
            style={{
              fontSize: '0.875rem',
              color: 'text.secondary',
              opacity: 0.7,
            }}
          >
            {results.duration > 1000
              ? `${(results.duration / 1000).toFixed(2)}s`
              : `${results.duration}ms`}
          </span>
        ) : null
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
  );
};
