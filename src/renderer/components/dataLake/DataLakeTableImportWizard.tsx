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
} from '@mui/material';
import {
  Link as LinkIcon,
  ArrowBack,
  ArrowForward,
  Folder,
  FolderOpen,
  Close,
} from '@mui/icons-material';
import { useFilePicker } from '../../controllers';

interface DataLakeTableImportWizardProps {
  open: boolean;
  onClose: () => void;
  onImport: (
    tableName: string,
    sourceQuery: string,
    partitionColumns?: string[],
  ) => void;
  isLoading?: boolean;
  dataPath?: string;
}

type SourceType = 'url' | 'file';

const steps = ['Select Source', 'Configure Import', 'Partitioning', 'Review'];

export const DataLakeTableImportWizard: React.FC<
  DataLakeTableImportWizardProps
> = ({ open, onClose, onImport, isLoading = false, dataPath }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [sourceType, setSourceType] = useState<SourceType>('url');
  const [tableName, setTableName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [partitionColumnsText, setPartitionColumnsText] = useState('');

  const [error, setError] = useState<string>('');

  const { mutate: getFiles } = useFilePicker();

  const handleFileSelect = () => {
    getFiles(
      {
        properties: ['openFile'],
        filters: [
          { name: 'Data Files', extensions: ['csv', 'parquet', 'json'] },
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
    if (activeStep === 0) {
      // Source type is always selected
    } else if (activeStep === 1) {
      if (!tableName.trim()) {
        setError('Table name is required');
        return;
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        setError(
          'Table name must start with a letter or underscore and contain only letters, numbers, and underscores',
        );
        return;
      }

      if (sourceType === 'url' && !sourceUrl.trim()) {
        setError('Source URL is required');
        return;
      }

      if (sourceType === 'file' && !filePath.trim()) {
        setError('File path is required');
        return;
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
    let sourceQuery = '';
    const src = sourceType === 'url' ? sourceUrl : filePath;
    const escapedSrc = src.replace(/'/g, "''");
    // Quote table name as identifier to prevent SQL injection and handle reserved words
    const escapedTableName = `"${tableName.replace(/"/g, '""')}"`;
    const isCsv = src.toLowerCase().endsWith('.csv');

    if (isCsv) {
      // Use specific CSV reader with error handling options
      // ignore_errors=true: Skips rows with parsing errors
      // null_padding=true: Pads missing columns with NULL
      sourceQuery = `CREATE TABLE ${escapedTableName} AS SELECT * FROM read_csv_auto('${escapedSrc}', ignore_errors=true, null_padding=true)`;
    } else {
      // Default behavior for other formats (Parquet, JSON, etc.)
      sourceQuery = `CREATE TABLE ${escapedTableName} AS FROM '${escapedSrc}'`;
    }

    const parsedPartitionColumns = partitionColumnsText
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    onImport(
      tableName,
      sourceQuery,
      parsedPartitionColumns.length > 0 ? parsedPartitionColumns : undefined,
    );
  };

  const handleClose = () => {
    setActiveStep(0);
    setSourceType('url');
    setTableName('');
    setSourceUrl('');
    setFilePath('');
    setPartitionColumnsText('');
    setError('');
    onClose();
  };

  const renderSourceSelection = () => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="body1" gutterBottom>
        Choose where to import data from
      </Typography>

      <Box
        sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2 }}
      >
        <Card
          variant="outlined"
          sx={{
            border: sourceType === 'url' ? 2 : 1,
            borderColor: sourceType === 'url' ? 'primary.main' : 'divider',
          }}
        >
          <CardActionArea onClick={() => setSourceType('url')}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <LinkIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">URL</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Import from HTTP/HTTPS URL
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: 'block' }}
              >
                Supports: CSV, Parquet, JSON
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>

        <Card
          variant="outlined"
          sx={{
            border: sourceType === 'file' ? 2 : 1,
            borderColor: sourceType === 'file' ? 'primary.main' : 'divider',
          }}
        >
          <CardActionArea onClick={() => setSourceType('file')}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Folder sx={{ width: 24, height: 24, mr: 1 }} />
                <Typography variant="h6">Local File</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Import from local file system
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: 'block' }}
              >
                Supports: CSV, Parquet, JSON
              </Typography>
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
        helperText="Enter a valid SQL table name"
        autoFocus
        sx={{ mb: 3 }}
      />

      {sourceType === 'url' && (
        <Box>
          <TextField
            fullWidth
            label="Source URL"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://example.com/data.csv"
            helperText="HTTP or HTTPS URL to CSV, Parquet, or JSON file"
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
              Example: Netherlands Train Stations
            </Typography>
            <Typography variant="body2" component="div">
              https://blobs.duckdb.org/nl_stations.csv
            </Typography>
          </Alert>
        </Box>
      )}

      {sourceType === 'file' && (
        <Box>
          <TextField
            fullWidth
            label="File Path"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="/path/to/file.csv"
            helperText="Absolute or relative path to CSV, Parquet, or JSON file"
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
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              DuckDB will automatically detect the file format and infer the
              schema.
            </Typography>
          </Alert>
        </Box>
      )}

      <Alert severity="success" sx={{ mt: 3 }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
          Automatic Schema Inference
        </Typography>
        <Typography variant="body2">
          DuckLake will automatically detect column names, types, and create the
          table schema. No manual column definition needed!
        </Typography>
      </Alert>
    </Box>
  );

  const renderPartitioning = () => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="body1" gutterBottom>
        Optional: configure partition columns
      </Typography>
      <TextField
        fullWidth
        label="Partition columns (comma-separated)"
        value={partitionColumnsText}
        onChange={(e) => setPartitionColumnsText(e.target.value)}
        placeholder="e.g., country, event_date"
        helperText="Applied after import via: ALTER TABLE <table> SET PARTITIONED BY (...)"
      />
      <Alert severity="info" sx={{ mt: 2 }}>
        Partitioning improves query performance by enabling pruning of
        irrelevant files.
      </Alert>
    </Box>
  );

  const renderReview = () => {
    const sourceValue = sourceType === 'url' ? sourceUrl : filePath;
    const parsedPartitionColumns = partitionColumnsText
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Review Import Configuration
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Table Name
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 2 }}>
            {tableName}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Source Type
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 2 }}>
            {sourceType === 'url' ? 'URL' : 'Local File'}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Source Location
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
            {sourceValue}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Partition Columns
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 2 }}>
            {parsedPartitionColumns.length > 0
              ? parsedPartitionColumns.join(', ')
              : 'None'}
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            DuckLake Data Path
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
            {dataPath || 'Unavailable'}
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            What will happen:
          </Typography>
          <Typography variant="body2" component="div">
            1. DuckLake will read the source data
            <br />
            2. Schema will be automatically inferred
            <br />
            3. Table metadata will be created in catalog for
            {dataPath ? ` ${dataPath}` : ' your configured data path'}
            <br />
            4. Data will be stored as Parquet files in DATA_PATH
            <br />
            5. Initial snapshot will be created
          </Typography>
        </Alert>

        <Alert severity="warning">
          <Typography variant="body2">
            This operation may take some time depending on the data size. For
            large uploads to cloud storage, waits of several minutes are normal.
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
        return renderPartitioning();
      case 3:
        return renderReview();
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Data to DuckLake</DialogTitle>
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
          onClick={handleClose}
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
          >
            {isLoading ? 'Importing...' : 'Import Data'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
