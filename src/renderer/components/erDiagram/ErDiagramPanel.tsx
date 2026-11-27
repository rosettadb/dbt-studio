import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material';
import { ErDiagram } from './ErDiagram';
import { buildErGraph, type ErTableInput } from './buildErGraph';

type Props = {
  tables: ErTableInput[];
  /** Every schema of the connection, also the ones without tables. */
  schemaNames?: string[];
  /** Schema shown first; defaults to the first schema by name. */
  initialSchema?: string;
  isLoading?: boolean;
  error?: string | null;
  /** Shown at the start of the header row, e.g. a title. */
  headerStart?: React.ReactNode;
  /** Spacing of the header row, which differs between a window and a tab. */
  headerSx?: SxProps<Theme>;
};

const LegendLine: React.FC<{ dashed?: boolean; label: string }> = ({
  dashed,
  label,
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
    <Box
      sx={{
        width: 24,
        borderTop: 2,
        borderTopStyle: dashed ? 'dashed' : 'solid',
        borderColor: dashed ? 'text.secondary' : 'primary.main',
      }}
    />
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
  </Box>
);

/**
 * The ER diagram of one schema with its legend, counts and schema picker.
 * Fills its parent's height. Starts on `initialSchema` when it mounts.
 */
export const ErDiagramPanel: React.FC<Props> = ({
  tables,
  schemaNames: allSchemaNames,
  initialSchema,
  isLoading,
  error,
  headerStart,
  headerSx,
}) => {
  // Empty schemas are listed too, like in the tree, and show "No tables".
  const schemaNames = useMemo(() => {
    const names = new Set([
      ...(allSchemaNames ?? []),
      ...tables.map((t) => t.schema),
    ]);
    if (initialSchema) names.add(initialSchema);
    return Array.from(names).sort();
  }, [allSchemaNames, tables, initialSchema]);
  const [schema, setSchema] = useState(initialSchema ?? '');

  const shownSchema = schemaNames.includes(schema) ? schema : schemaNames[0];

  const graph = useMemo(
    () => buildErGraph(tables.filter((t) => t.schema === shownSchema)),
    [tables, shownSchema],
  );
  const guessedCount = graph.relationships.filter((r) => r.inferred).length;
  const foreignKeyCount = graph.relationships.length - guessedCount;

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  } else if (error) {
    body = (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  } else if (graph.tables.length === 0) {
    body = (
      <Box
        sx={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          color: 'text.secondary',
        }}
      >
        No tables in this schema.
      </Box>
    );
  } else {
    // A new key per schema re-fits the view to the new tables.
    body = <ErDiagram key={shownSchema} graph={graph} />;
  }

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      data-testid="er-diagram-panel"
    >
      <Box
        sx={[
          {
            display: 'flex',
            alignItems: 'flex-end',
            gap: 3,
            flexWrap: 'wrap',
          },
          ...(Array.isArray(headerSx) ? headerSx : [headerSx]),
        ]}
      >
        <Box sx={{ mr: 'auto' }}>{headerStart}</Box>
        {!isLoading && !error && schemaNames.length > 0 && (
          <>
            {/* Only the kinds of line the diagram actually has. */}
            {graph.relationships.length > 0 && (
              <Box
                sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
                data-testid="er-diagram-legend"
              >
                {foreignKeyCount > 0 && <LegendLine label="Foreign key" />}
                {guessedCount > 0 && (
                  <LegendLine dashed label="Matched by column name" />
                )}
              </Box>
            )}
            <Typography variant="body2" color="text.secondary">
              {graph.tables.length} tables · {graph.relationships.length}{' '}
              relationships
              {guessedCount > 0 && ` (${guessedCount} matched by name)`}
            </Typography>
            <TextField
              select
              size="small"
              label="Schema"
              value={shownSchema ?? ''}
              onChange={(e) => setSchema(e.target.value)}
              sx={{ minWidth: 200 }}
              data-testid="er-diagram-schema-select"
            >
              {schemaNames.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        {body}
      </Box>
    </Box>
  );
};
