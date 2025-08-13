import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Tabs,
  Tab,
} from '@mui/material';
import { Download, ContentCopy } from '@mui/icons-material';

interface CompileModalProps {
  open: boolean;
  onClose: () => void;
  originalSql: string;
  compiledSql: string;
  modelName: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`compile-tabpanel-${index}`}
      aria-labelledby={`compile-tab-${index}`}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          <Typography
            component="pre"
            sx={{
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark' ? '#2d2d2d' : '#f5f5f5',
              color: (theme) => theme.palette.text.primary,
              padding: 2,
              borderRadius: 1,
              overflow: 'auto',
              maxHeight: '70vh',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              border: (theme) => `1px solid ${theme.palette.divider}`,
            }}
          >
            {children}
          </Typography>
        </Box>
      )}
    </div>
  );
}

export const CompileModal: React.FC<CompileModalProps> = ({
  open,
  onClose,
  originalSql,
  compiledSql,
  modelName,
}) => {
  const [tabValue, setTabValue] = React.useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDownloadSQL = (sql: string, filename: string) => {
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '80vh' },
      }}
    >
      <DialogTitle>
        <Typography variant="h6">Compiled SQL: {modelName}</Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label="Original SQL" />
            <Tab label="Compiled SQL" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button
              startIcon={<ContentCopy />}
              onClick={() => handleCopyToClipboard(originalSql)}
              size="small"
            >
              Copy
            </Button>
            <Button
              startIcon={<Download />}
              onClick={() =>
                handleDownloadSQL(originalSql, `${modelName}_original.sql`)
              }
              size="small"
              sx={{ ml: 1 }}
            >
              Download
            </Button>
          </Box>
          {originalSql}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button
              startIcon={<ContentCopy />}
              onClick={() => handleCopyToClipboard(compiledSql)}
              size="small"
            >
              Copy
            </Button>
            <Button
              startIcon={<Download />}
              onClick={() =>
                handleDownloadSQL(compiledSql, `${modelName}_compiled.sql`)
              }
              size="small"
              sx={{ ml: 1 }}
            >
              Download
            </Button>
          </Box>
          {compiledSql}
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
