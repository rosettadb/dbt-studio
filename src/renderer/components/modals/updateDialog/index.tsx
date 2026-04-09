import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  IconButton,
  Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { toast } from 'react-toastify';
import {
  useCheckForUpdates,
  useDownloadUpdate,
  useRestartUpdate,
  useRejectUpdateVersion,
} from '../../../controllers';
import { UpdateInfo } from '../../../../types/backend';

export const UpdateDialog: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showRestartButton, setShowRestartButton] = useState(false);

  const checkForUpdates = useCheckForUpdates();
  const downloadUpdate = useDownloadUpdate();
  const restartUpdate = useRestartUpdate();
  const rejectUpdateVersion = useRejectUpdateVersion();

  const handleCheckForUpdates = async () => {
    try {
      const result = await checkForUpdates();
      if (result) {
        setUpdateInfo(result);
      }
    } catch {
      /* empty */
    }
  };

  useEffect(() => {
    handleCheckForUpdates();
    const interval = setInterval(handleCheckForUpdates, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdate = async () => {
    setIsDownloading(true);
    try {
      const res = await downloadUpdate();
      setIsDownloading(false);
      if (!res) {
        toast.info('No update was downloaded.');
        setShowRestartButton(false);
        return;
      }
      toast.success(
        'Update downloaded. The update will be installed after you restart the app.',
      );
      setShowRestartButton(true);
    } catch (error) {
      toast.error('Failed to download update.');
      setIsDownloading(false);
    }
  };

  const handleRestart = async () => {
    try {
      await restartUpdate();
    } catch (error) {
      toast.error('Failed to restart and install update.');
    }
  };

  const handleReject = async () => {
    if (updateInfo) {
      await rejectUpdateVersion(updateInfo.newVersion);
      setUpdateInfo(null);
    }
  };

  if (!updateInfo) return null;

  const handleClose = () => {
    setUpdateInfo(null);
  };

  return (
    <Dialog
      open={!!updateInfo}
      onClose={isDownloading ? undefined : handleClose}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        Update Available
        <IconButton
          aria-label="close"
          onClick={handleClose}
          edge="end"
          size="small"
          sx={{ ml: 2 }}
          disabled={isDownloading}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          A new version ({updateInfo.newVersion}) is available. You are running{' '}
          {updateInfo.currentVersion}.
        </Typography>
        {updateInfo.releaseNotes && (
          <Box
            sx={{
              color: 'text.primary',
              '& a': {
                color: 'primary.main',
                textDecorationColor: 'primary.main',
              },
              '& a:visited': {
                color: 'primary.main',
              },
              '& code': {
                fontFamily: 'Monaco, Menlo, Consolas, "Courier New", monospace',
              },
              '& pre': {
                overflowX: 'auto',
              },
              '& h1, & h2, & h3, & h4, & h5, & h6': {
                color: 'text.primary',
              },
              '& p, & li, & span, & div': {
                color: 'text.primary',
              },
            }}
          >
            <Typography
              variant="body2"
              component="div"
              dangerouslySetInnerHTML={{ __html: updateInfo.releaseNotes }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleReject} color="primary" disabled={isDownloading}>
          Not Now
        </Button>
        {!showRestartButton ? (
          <Button
            onClick={handleUpdate}
            color="primary"
            variant="contained"
            disabled={isDownloading}
            startIcon={isDownloading ? <CircularProgress size={16} /> : null}
          >
            {isDownloading ? 'Downloading...' : 'Update Now'}
          </Button>
        ) : (
          <Button
            onClick={handleRestart}
            color="secondary"
            variant="outlined"
            disabled={isDownloading}
          >
            Restart Now
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
