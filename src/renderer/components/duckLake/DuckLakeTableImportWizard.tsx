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
} from '@mui/material';
import {
  CloudUpload,
  Link as LinkIcon,
  ArrowBack,
  ArrowForward,
} from '@mui/icons-material';

interface DuckLakeTableImportWizardProps {
  open: boolean;
  onClose: () => void;
  onImport: (tableName: string, sourceQuery: string) => void;
  isLoading?: boolean;
}

type SourceType = 'url' | 'file';

const steps = ['Select Source', 'Configure Import', 'Review'];

export const DuckLakeTableImportWizard: React.FC<
  DuckLakeTableImportWizardProps
> = ({ open, onClose, onImport, isLoading = false }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [sourceType, setSourceType] = useState<SourceType>('url');
  const [tableName, setTableName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [error, setError] = useState<string>('');

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

    switch (sourceType) {
      case 'url':
        sourceQuery = `CREATE TABLE ${tableName} AS FROM '${sourceUrl}'`;
        break;
      case 'file':
        sourceQuery = `CREATE TABLE ${tableName} AS FROM '${filePath}'`;
        break;
      default:
        sourceQuery = '';
    }

    onImport(tableName, sourceQuery);
  };

  const handleClose = () => {
    setActiveStep(0);
    setSourceType('url');
    setTableName('');
    setSourceUrl('');
    setFilePath('');
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
                <CloudUpload color="primary" sx={{ mr: 1 }} />
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

  const renderReview = () => {
    const sourceValue = sourceType === 'url' ? sourceUrl : filePath;

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
            3. Table will be created with metadata in catalog
            <br />
            4. Data will be stored as Parquet files in DATA_PATH
            <br />
            5. Initial snapshot will be created
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
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        {activeStep > 0 && (
          <Button
            onClick={handleBack}
            startIcon={<ArrowBack />}
            disabled={isLoading}
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
