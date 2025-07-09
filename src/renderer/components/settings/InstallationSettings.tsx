import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Backdrop,
} from '@mui/material';
import { Download, CheckCircle, Update, Info } from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useCheckForSettingsUpdates,
  useDownloadUpdate,
  useRestartUpdate,
} from '../../controllers';
import { UpdateSettingsInfo } from '../../../types/backend';

function compareVersions(v1: string, v2: string): number {
  const a = v1.split('.').map(Number);
  const b = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const num1 = a[i] || 0;
    const num2 = b[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

const InstallationSettings: React.FC = () => {
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<UpdateSettingsInfo | null>(null);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);
  const [showRestartButton, setShowRestartButton] = useState(false);

  const checkForSettingsUpdates = useCheckForSettingsUpdates();
  const downloadUpdate = useDownloadUpdate();
  const restartUpdate = useRestartUpdate();

  const getCurrentVersion = async () => {
    try {
      setCurrentVersion(window.electron?.app?.version || 'Unknown');
    } catch (err: any) {
      setError('Failed to get current version.');
      setCurrentVersion('Unknown');
    }
  };

  const getSystemInfo = async () => {
    try {
      const { userAgent } = navigator;
      // Detect OS
      let os = 'Unknown';
      if (userAgent.includes('Mac')) os = 'macOS';
      else if (userAgent.includes('Win')) os = 'Windows';
      else if (userAgent.includes('Linux')) os = 'Linux';

      // Detect architecture from user agent
      let arch = 'Unknown';
      if (userAgent.includes('Intel')) arch = 'Intel';
      else if (userAgent.includes('arm64') || userAgent.includes('ARM64'))
        arch = 'ARM64';
      else if (userAgent.includes('x86_64') || userAgent.includes('x64'))
        arch = 'x64';
      else if (userAgent.includes('i386') || userAgent.includes('x86'))
        arch = 'x86';

      // Extract versions from user agent
      const chromeMatch = userAgent.match(/Chrome\/([0-9.]+)/);
      const electronMatch = userAgent.match(/Electron\/([0-9.]+)/);

      setSystemInfo({
        platform: os,
        arch,
        electronVersion: electronMatch ? electronMatch[1] : 'Unknown',
        nodeVersion: 'Available in main process',
        chromeVersion: chromeMatch ? chromeMatch[1] : 'Unknown',
        userAgent,
      });
    } catch (err) {
      setError('Failed to get system information.');
      setSystemInfo({
        platform: 'Unknown',
        arch: 'Unknown',
        electronVersion: 'Unknown',
        nodeVersion: 'Unknown',
        chromeVersion: 'Unknown',
      });
    }
  };

  // Get current version on component mount
  useEffect(() => {
    getCurrentVersion();
    getSystemInfo();
  }, []);

  const checkForUpdates = async () => {
    setIsCheckingForUpdates(true);
    setError(null);
    try {
      const result = await checkForSettingsUpdates();
      if (result) {
        setUpdateInfo(result);
        setLatestVersion(result.newVersion);
      } else {
        setUpdateInfo(null);
        setLatestVersion(currentVersion); // No update, so latest = current
      }
      setLastChecked(new Date());
    } catch (err) {
      setError('Failed to check for updates.');
    } finally {
      setIsCheckingForUpdates(false);
    }
  };

  const handleUpdate = async () => {
    if (!updateInfo) return;
    setIsUpdating(true);
    setIsBlocking(true);
    setError(null);
    try {
      const res = await downloadUpdate();
      setIsUpdating(false);
      setIsBlocking(false);
      if (!res) {
        toast.info('No update was downloaded.');
        setShowRestartButton(false);
        return;
      }
      toast.success(
        'Update downloaded. Please close and restart the app manually to complete the update.',
      );
      setShowRestartButton(false);
    } catch (err: any) {
      setError('Failed to download update.');
      toast.error('Failed to download update.');
      setIsUpdating(false);
      setIsBlocking(false);
    }
  };

  const handleRestart = async () => {
    try {
      await restartUpdate();
    } catch (err) {
      toast.error('Failed to restart and install update.');
    }
  };

  const isUpdateAvailable =
    latestVersion &&
    currentVersion &&
    compareVersions(latestVersion, currentVersion) === 1;

  return (
    <Box sx={{ maxWidth: 600, width: '100%' }}>
      <Backdrop
        open={isBlocking}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Typography variant="h6" gutterBottom>
        Installation Information
      </Typography>
      {/* Current Version Card */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Info color="primary" />
            <Typography variant="h6">Current Installation</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="body1">Current Version:</Typography>
            <Chip
              label={currentVersion}
              color="primary"
              variant="outlined"
              icon={<CheckCircle />}
            />
          </Box>
          {latestVersion && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="body1">Latest Version:</Typography>
              <Chip
                label={latestVersion}
                color={isUpdateAvailable ? 'warning' : 'success'}
                variant="outlined"
                icon={<Update />}
              />
            </Box>
          )}
          {isUpdateAvailable && !showRestartButton && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleUpdate}
              disabled={isUpdating}
              startIcon={
                isUpdating ? <CircularProgress size={16} /> : <Download />
              }
              sx={{ mt: 1 }}
            >
              {isUpdating ? 'Downloading...' : 'Update Now'}
            </Button>
          )}
          {isUpdateAvailable && showRestartButton && (
            <Button
              onClick={handleRestart}
              color="secondary"
              variant="outlined"
              disabled={isUpdating}
              sx={{ mt: 1, ml: 2 }}
            >
              Restart Now
            </Button>
          )}
          <Typography variant="body2" color="textSecondary" className="mt-2">
            Rosetta dbt Studio - Turn Raw Data into Business Insights
          </Typography>
        </CardContent>
      </Card>
      {/* Update Check Section */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Update color="primary" />
            <Typography variant="h6">Updates</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Button
              variant="outlined"
              onClick={checkForUpdates}
              disabled={isCheckingForUpdates}
              startIcon={
                isCheckingForUpdates ? (
                  <CircularProgress size={16} />
                ) : (
                  <Download />
                )
              }
            >
              {isCheckingForUpdates ? 'Checking...' : 'Check for Updates'}
            </Button>
            {lastChecked && (
              <Typography variant="body2" color="textSecondary">
                Last checked: {lastChecked.toLocaleString()}
              </Typography>
            )}
          </Box>
          {updateInfo && (
            <>
              <Divider sx={{ my: 2 }} />
              {isUpdateAvailable ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body1" gutterBottom>
                    A new version ({latestVersion}) is available!
                  </Typography>
                  {updateInfo.releaseNotes && (
                    <Box sx={{ mt: 1, mb: 2 }}>
                      <Typography variant="body2" color="textSecondary">
                        Release Notes:
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ mt: 1 }}
                        dangerouslySetInnerHTML={{
                          __html: updateInfo.releaseNotes,
                        }}
                      />
                    </Box>
                  )}
                </Alert>
              ) : (
                <Alert severity="success">
                  <Typography variant="body1">
                    You are running the latest version ({currentVersion})
                  </Typography>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {/* System Information */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            System Information
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="textSecondary">
                Operating System:
              </Typography>
              <Typography variant="body2">
                {systemInfo?.platform || 'Loading...'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="textSecondary">
                Architecture:
              </Typography>
              <Typography variant="body2">
                {systemInfo?.arch || 'Loading...'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="textSecondary">
                Electron Version:
              </Typography>
              <Typography variant="body2">
                {systemInfo?.electronVersion || 'Loading...'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="textSecondary">
                Chrome Version:
              </Typography>
              <Typography variant="body2">
                {systemInfo?.chromeVersion || 'Loading...'}
              </Typography>
            </Box>
            {systemInfo?.userAgent && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  User Agent:
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ wordBreak: 'break-all', display: 'block' }}
                >
                  {systemInfo.userAgent}
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export { InstallationSettings };
