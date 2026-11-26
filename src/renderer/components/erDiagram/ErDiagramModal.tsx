import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { Modal } from '../modals/modal';
import { ErDiagram } from './ErDiagram';
import { buildErGraph, type ErTableInput } from './buildErGraph';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Shown under the title, e.g. the connection or instance name. */
  sourceName?: string;
  tables: ErTableInput[];
  /** Schema shown first; defaults to the first schema by name. */
  initialSchema?: string;
  isLoading?: boolean;
  error?: string | null;
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

export const ErDiagramModal: React.FC<Props> = ({
  isOpen,
  onClose,
  sourceName,
  tables,
  initialSchema,
  isLoading,
  error,
}) => {
  // The schema it was opened for is listed even without tables, so an empty
  // schema shows "No tables" instead of another schema's diagram.
  const schemaNames = useMemo(() => {
    const names = new Set(tables.map((t) => t.schema));
    if (initialSchema) names.add(initialSchema);
    return Array.from(names).sort();
  }, [tables, initialSchema]);
  const [schema, setSchema] = useState('');

  // Each time the diagram opens, start on the schema it was opened for.
  useEffect(() => {
    if (isOpen) setSchema(initialSchema ?? '');
  }, [isOpen, initialSchema]);

  const shownSchema = schemaNames.includes(schema) ? schema : schemaNames[0];

  // Built only while open: the SQL screen keeps this mounted with its tables.
  const graph = useMemo(
    () =>
      buildErGraph(
        isOpen ? tables.filter((t) => t.schema === shownSchema) : [],
      ),
    [isOpen, tables, shownSchema],
  );
  const guessedCount = graph.relationships.filter((r) => r.inferred).length;

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="ER Diagram"
      hideHeader
      fullScreen
      maxWidth="xl"
    >
      <Box
        sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        data-testid="er-diagram-modal"
      >
        <Box
          sx={{
            px: 3,
            pt: 3,
            pb: 2,
            pr: 8,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 3,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ mr: 'auto' }}>
            <Typography variant="h6">ER Diagram</Typography>
            {sourceName && (
              <Typography variant="body2" color="text.secondary">
                {sourceName}
              </Typography>
            )}
          </Box>
          {!isLoading && !error && schemaNames.length > 0 && (
            <>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <LegendLine label="Foreign key" />
                <LegendLine
                  dashed
                  label="Matched by column name (customer_id → customers.id)"
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {graph.tables.length} tables · {graph.relationships.length}{' '}
                relationships
                {guessedCount > 0 && ` (${guessedCount} matched by name)`}
              </Typography>
              <TextField
                select
                size="small"
                label="Schema"
                value={shownSchema}
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
            overflow: 'hidden',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {body}
        </Box>
      </Box>
    </Modal>
  );
};
