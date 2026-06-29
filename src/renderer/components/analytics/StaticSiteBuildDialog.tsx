import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  LinearProgress,
  IconButton,
  Tooltip,
  Chip,
  Alert,
} from '@mui/material';
import {
  FolderOpen as FolderOpenIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Language as LanguageIcon,
} from '@mui/icons-material';
import { StaticSiteService } from '../../services/staticSite.service';
import type {
  StaticSiteBuildProgress,
  StaticSiteBuildResult,
} from '../../../types/staticSite';

// ─── Dialog states ────────────────────────────────────────────────────────────
type DialogView =
  | 'configure'
  | 'confirm-overwrite'
  | 'building'
  | 'success'
  | 'error';

interface StaticSiteBuildDialogProps {
  open: boolean;
  connectionId: string;
  connectionName: string;
  pageCount: number;
  onClose: () => void;
  /** Called after a successful build so the parent can update state */
  onBuildSuccess: (result: StaticSiteBuildResult) => void;
}

export const StaticSiteBuildDialog: React.FC<StaticSiteBuildDialogProps> = ({
  open,
  connectionId,
  connectionName,
  pageCount,
  onClose,
  onBuildSuccess,
}) => {
  const [view, setView] = useState<DialogView>('configure');
  const [outputPath, setOutputPath] = useState('');
  const [loadingDefaultPath, setLoadingDefaultPath] = useState(false);
  const [progress, setProgress] = useState<StaticSiteBuildProgress | null>(
    null,
  );
  const [buildResult, setBuildResult] = useState<StaticSiteBuildResult | null>(
    null,
  );
  const [pickingFolder, setPickingFolder] = useState(false);

  // Load default path on open
  useEffect(() => {
    if (open && !outputPath) {
      setLoadingDefaultPath(true);
      // eslint-disable-next-line promise/catch-or-return
      StaticSiteService.getDefaultOutputPath(connectionName)
        .then((p) => setOutputPath(p))
        .catch(() => {})
        .finally(() => setLoadingDefaultPath(false));
    }
  }, [open, connectionName, outputPath]);

  // Subscribe to build progress events
  useEffect(() => {
    if (view !== 'building') return undefined;
    return StaticSiteService.subscribeToBuildProgress((p) => {
      setProgress(p);
    });
  }, [view]);

  // Reset on close
  const handleClose = useCallback(() => {
    if (view === 'building') return; // block accidental close during build
    setView('configure');
    setProgress(null);
    setBuildResult(null);
    onClose();
  }, [view, onClose]);

  // Browse for folder
  const handleBrowse = async () => {
    setPickingFolder(true);
    try {
      const chosen = await StaticSiteService.pickFolder(outputPath);
      if (chosen) setOutputPath(chosen);
    } finally {
      setPickingFolder(false);
    }
  };

  const startBuild = async (overwrite: boolean) => {
    setView('building');
    setProgress({ phase: 'loading', message: 'Preparing…' });
    try {
      const result = await StaticSiteService.build({
        connectionId,
        outputPath: outputPath.trim(),
        overwrite,
      });
      setBuildResult(result);
      if (result.success) {
        setView('success');
        onBuildSuccess(result);
      } else if (result.error === 'OUTPUT_EXISTS') {
        // Shouldn't reach here since we already checked, but handle gracefully
        setView('confirm-overwrite');
      } else {
        setView('error');
      }
    } catch (err: any) {
      setBuildResult({
        success: false,
        outputPath,
        pageCount: 0,
        queryCount: 0,
        error: err?.message ?? 'Build failed',
      });
      setView('error');
    }
  };

  // Main build trigger — checks for existing folder first
  const handleBuildClick = async () => {
    if (!outputPath.trim()) return;
    const exists = await StaticSiteService.folderExists(outputPath.trim());
    if (exists) {
      setView('confirm-overwrite');
    } else {
      await startBuild(false);
    }
  };

  const progressPercent =
    progress?.current !== undefined && progress?.total
      ? Math.round((progress.current / progress.total) * 100)
      : undefined;

  // ─── Render: Configure ──────────────────────────────────────────────────────
  if (view === 'configure') {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LanguageIcon sx={{ color: 'primary.main' }} />
          Build Analytics Site
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              Exports all <strong>{pageCount}</strong> analytics page
              {pageCount !== 1 ? 's' : ''} to a self-contained static website.
              Query results will be pre-fetched and embedded — no database
              connection needed to view the site.
            </Typography>

            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={500}
              >
                Output Folder
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                <TextField
                  fullWidth
                  size="small"
                  value={loadingDefaultPath ? 'Loading…' : outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  placeholder="/path/to/output"
                  disabled={loadingDefaultPath}
                  inputProps={{ 'aria-label': 'Output folder path' }}
                />
                <Tooltip title="Browse for folder">
                  <span>
                    <IconButton
                      onClick={handleBrowse}
                      disabled={pickingFolder || loadingDefaultPath}
                      size="small"
                      sx={{
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                      }}
                    >
                      <FolderOpenIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleBuildClick}
            disabled={!outputPath.trim() || loadingDefaultPath}
            startIcon={<LanguageIcon />}
          >
            Build Site
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // ─── Render: Confirm Overwrite ───────────────────────────────────────────────
  if (view === 'confirm-overwrite') {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: 'warning.main',
          }}
        >
          <WarningIcon color="warning" />
          Overwrite existing site?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            A site already exists at:
          </Typography>
          <Box
            sx={{
              my: 1.5,
              px: 1.5,
              py: 1,
              bgcolor: 'action.hover',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              wordBreak: 'break-all',
            }}
          >
            {outputPath}
          </Box>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete all files in that folder and replace
            them with the new build.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setView('configure')}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => startBuild(true)}
          >
            Overwrite &amp; Build
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // ─── Render: Building ────────────────────────────────────────────────────────
  if (view === 'building') {
    return (
      <Dialog open={open} maxWidth="sm" fullWidth>
        <DialogTitle>Building site…</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {progressPercent !== undefined ? (
              <LinearProgress variant="determinate" value={progressPercent} />
            ) : (
              <LinearProgress variant="indeterminate" />
            )}
            <Typography variant="body2" color="text.secondary">
              {progress?.message ?? 'Preparing…'}
            </Typography>
            {progress?.current !== undefined &&
              progress?.total !== undefined && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip
                    size="small"
                    label={`${progress.current} / ${progress.total}`}
                    variant="outlined"
                  />
                </Box>
              )}
          </Box>
        </DialogContent>
        {/* No actions during build — user must wait */}
      </Dialog>
    );
  }

  // ─── Render: Success ─────────────────────────────────────────────────────────
  if (view === 'success' && buildResult) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon sx={{ color: 'success.main' }} />
          Site built successfully
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            {buildResult.pageCount} page{buildResult.pageCount !== 1 ? 's' : ''}{' '}
            and {buildResult.queryCount} quer
            {buildResult.queryCount !== 1 ? 'ies' : 'y'} exported.
          </Alert>
          <Box
            sx={{
              px: 1.5,
              py: 1,
              bgcolor: 'action.hover',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              wordBreak: 'break-all',
            }}
          >
            {buildResult.outputPath}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
          <Button
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={() => StaticSiteService.openFolder(buildResult.outputPath)}
          >
            Open Folder
          </Button>
          <Button
            variant="contained"
            startIcon={<LanguageIcon />}
            onClick={() =>
              StaticSiteService.openPreview(buildResult.outputPath)
            }
          >
            Preview in Browser
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // ─── Render: Error ────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          color: 'error.main',
        }}
      >
        Build Failed
      </DialogTitle>
      <DialogContent>
        <Alert severity="error">
          {buildResult?.error ?? 'An unexpected error occurred.'}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        <Button variant="contained" onClick={() => setView('configure')}>
          Try Again
        </Button>
      </DialogActions>
    </Dialog>
  );
};
