import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  TextField,
  Typography,
  Alert,
  Card,
  CardContent,
  CardActionArea,
  IconButton,
  CircularProgress,
  Autocomplete,
  Chip,
} from '@mui/material';
import {
  ArrowBack,
  ArrowForward,
  Folder,
  FolderOpen,
  Close,
  CloudDownload,
  Cloud,
  TableChart,
} from '@mui/icons-material';
import { useFilePicker } from '../../../controllers/settings.controller';
import { useListIcebergNamespaces } from '../../../controllers/icebergDatalake.controller';
import type { IcebergImportFileFormat } from '../../../../types/iceberg';

interface IcebergTableImportWizardProps {
  open: boolean;
  onClose: () => void;
  onImport: (
    namespace: string[],
    tableName: string,
    filePath: string,
    fileFormat: IcebergImportFileFormat,
  ) => void;
  isLoading?: boolean;
  instanceId: string;
}

const steps = ['Select Source', 'Configure Import', 'Review'];

const SUPPORTED_EXTENSIONS: {
  ext: string;
  format: IcebergImportFileFormat;
}[] = [
  { ext: 'csv', format: 'csv' },
  { ext: 'parquet', format: 'parquet' },
  { ext: 'pq', format: 'parquet' },
  { ext: 'json', format: 'json' },
];

const detectFormat = (
  filePath: string,
): IcebergImportFileFormat | undefined => {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return SUPPORTED_EXTENSIONS.find((item) => item.ext === ext)?.format;
};

export const IcebergTableImportWizard: React.FC<
  IcebergTableImportWizardProps
> = ({ open, onClose, onImport, isLoading = false, instanceId }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [tableName, setTableName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(
    '__new__',
  );
  const [newNamespace, setNewNamespace] = useState('default');
  const [error, setError] = useState('');

  const { mutate: getFiles } = useFilePicker();
  const namespacesQuery = useListIcebergNamespaces(instanceId);
  const namespaces = (namespacesQuery.data ?? []).map((ns) => ns.join('.'));

  const isCreatingNamespace =
    selectedNamespace === '__new__' || selectedNamespace === null;

  const handleFileSelect = () => {
    getFiles(
      {
        properties: ['openFile'],
        filters: [
          { name: 'Data Files', extensions: ['csv', 'parquet', 'pq', 'json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      },
      {
        onSuccess: (filePaths) => {
          if (filePaths && filePaths.length > 0) {
            setFilePath(filePaths[0]);
          }
        },
      },
    );
  };

  const handleNext = () => {
    if (activeStep === 1) {
      if (!tableName.trim()) {
        setError('Table name is required');
        return;
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName.trim())) {
        setError(
          'Table name must start with a letter or underscore and contain only letters, numbers, and underscores',
        );
        return;
      }
      if (!filePath.trim()) {
        setError('File path is required');
        return;
      }
      if (!detectFormat(filePath)) {
        setError('Unsupported file type. Use CSV, Parquet, or JSON.');
        return;
      }
      if (isCreatingNamespace) {
        const namespaceParts = newNamespace
          .split('.')
          .map((part) => part.trim())
          .filter(Boolean);
        if (
          namespaceParts.length === 0 ||
          namespaceParts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))
        ) {
          setError(
            'Namespace must be dot-separated identifiers (letters, numbers, underscores)',
          );
          return;
        }
      }
    }
    setError('');
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setError('');
    setActiveStep((prev) => prev - 1);
  };

  const handleImport = () => {
    const namespace: string[] = isCreatingNamespace
      ? newNamespace
          .split('.')
          .map((part) => part.trim())
          .filter(Boolean)
      : (selectedNamespace ?? 'default').split('.');
    const format = detectFormat(filePath);
    if (!format) return;
    onImport(namespace, tableName.trim(), filePath.trim(), format);
  };

  const resetForm = () => {
    setActiveStep(0);
    setTableName('');
    setFilePath('');
    setSelectedNamespace('__new__');
    setNewNamespace('default');
    setError('');
  };

  const renderSourceSelection = () => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="body1" gutterBottom>
        Choose where to import data from
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          gap: 2,
          mt: 2,
        }}
      >
        <Card
          variant="outlined"
          sx={{ border: 2, borderColor: 'primary.main' }}
        >
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Folder sx={{ width: 24, height: 24, mr: 1 }} color="primary" />
              <Typography variant="h6">Local File</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Import from local file system
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Supports: CSV, Parquet, JSON
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ opacity: 0.55 }}>
          <CardActionArea disabled sx={{ height: '100%' }}>
            <CardContent>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
              >
                <Cloud sx={{ width: 24, height: 24 }} />
                <Typography variant="h6">From Object Storage</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Import from a Cloud Explorer bucket or object path
              </Typography>
              <Chip
                label="Coming Soon"
                size="small"
                variant="outlined"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </CardActionArea>
        </Card>
      </Box>
    </Box>
  );

  const renderConfigureImport = () => (
    <Box sx={{ mt: 2 }}>
      <TextField
        fullWidth
        label="Table Name"
        value={tableName}
        onChange={(e) => setTableName(e.target.value)}
        placeholder="e.g., customers, orders, products"
        helperText="Enter a valid Iceberg table name"
        autoFocus
        sx={{ mb: 3 }}
      />

      <Autocomplete
        fullWidth
        value={selectedNamespace}
        options={['__new__', ...namespaces]}
        onChange={(_event, value) => {
          setSelectedNamespace(value ?? null);
          if (value === '__new__' || value === null) {
            setNewNamespace('default');
          }
        }}
        getOptionLabel={(option) =>
          option === '__new__' ? 'Create new namespace…' : option
        }
        isOptionEqualToValue={(option, value) => option === value}
        renderOption={(props, option) => (
          <li
            {...props} // eslint-disable-line react/jsx-props-no-spreading
            key={option}
          >
            {option === '__new__' ? 'Create new namespace…' : option}
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params} // eslint-disable-line react/jsx-props-no-spreading
            label="Namespace"
            placeholder="default"
            helperText="Choose an existing namespace or create a new one (dot-separated for nested)"
            sx={{ mb: isCreatingNamespace ? 2 : 3 }}
          />
        )}
      />

      {isCreatingNamespace && (
        <TextField
          fullWidth
          label="New Namespace"
          value={newNamespace}
          onChange={(e) => setNewNamespace(e.target.value)}
          placeholder="e.g., default or analytics.raw"
          helperText="Nested namespaces are separated by dots"
          sx={{ mb: 3 }}
        />
      )}

      <TextField
        fullWidth
        label="File Path"
        value={filePath}
        onChange={(e) => setFilePath(e.target.value)}
        placeholder="/path/to/file.csv"
        helperText="Absolute path to CSV, Parquet, or JSON file"
        slotProps={{
          input: {
            endAdornment: (
              <IconButton onClick={handleFileSelect} edge="end">
                <FolderOpen />
              </IconButton>
            ),
          },
        }}
      />
      {filePath && (
        <Box sx={{ mt: 1.5 }}>
          <Chip
            size="small"
            label={`Format: ${detectFormat(filePath) ?? 'unsupported'}`}
            color={detectFormat(filePath) ? 'success' : 'error'}
            variant="outlined"
          />
        </Box>
      )}

      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          PyIceberg will automatically infer the file schema, create the table,
          and append the data as the initial snapshot.
        </Typography>
      </Alert>
    </Box>
  );

  const renderReview = () => {
    const namespace = isCreatingNamespace
      ? newNamespace
          .split('.')
          .map((part) => part.trim())
          .filter(Boolean)
      : (selectedNamespace ?? 'default').split('.');
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Review Import Configuration
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Table Identifier
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 'bold',
              mb: 2,
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}
          >
            {namespace.join('.')}.{tableName}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Source File
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 'bold',
              mb: 2,
              wordBreak: 'break-all',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
            }}
          >
            {filePath || 'Unavailable'}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Detected Format
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 2 }}>
            {detectFormat(filePath)?.toUpperCase() ?? '—'}
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            What will happen:
          </Typography>
          <Typography variant="body2" component="div">
            1. PyIceberg reads the source file and infers the schema
            <br />
            2. The namespace is created if it does not exist
            <br />
            3. An Iceberg table is created with the inferred schema
            <br />
            4. Data is appended and an initial snapshot is committed
          </Typography>
        </Alert>

        <Alert severity="warning">
          <Typography variant="body2">
            This operation may take some time depending on the data size.
          </Typography>
        </Alert>
      </Box>
    );
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return renderSourceSelection();
      case 1:
        return renderConfigureImport();
      case 2:
        return renderReview();
      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      TransitionProps={{ onExited: resetForm }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TableChart color="primary" />
        Import Data to Iceberg
      </DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {renderStepContent()}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          disabled={isLoading}
          variant="outlined"
          startIcon={<Close />}
        >
          Cancel
        </Button>
        {activeStep > 0 && (
          <Button
            onClick={handleBack}
            startIcon={<ArrowBack />}
            disabled={isLoading}
            variant="outlined"
          >
            Back
          </Button>
        )}
        {activeStep < steps.length - 1 ? (
          <Button
            onClick={handleNext}
            variant="contained"
            endIcon={<ArrowForward />}
            disabled={isLoading}
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={handleImport}
            variant="contained"
            color="primary"
            disabled={isLoading}
            startIcon={
              isLoading ? <CircularProgress size={16} /> : <CloudDownload />
            }
          >
            {isLoading ? 'Importing...' : 'Import Data'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
