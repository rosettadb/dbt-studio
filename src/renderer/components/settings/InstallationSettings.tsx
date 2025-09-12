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

// Error types for better error handling
interface ErrorInfo {
  message: string;
  type:
    | 'network'
    | 'permission'
    | 'version'
    | 'download'
    | 'system'
    | 'unknown';
  details?: string;
  retryable: boolean;
}

function compareVersions(v1: string, v2: string): number {
  // Handle prerelease versions (beta, alpha, etc.)
  const isPrerelease = (version: string) => version.includes('-');

  // If one is prerelease and the other isn't, prefer stable
  const v1IsPrerelease = isPrerelease(v1);
  const v2IsPrerelease = isPrerelease(v2);

  if (v1IsPrerelease && !v2IsPrerelease) return -1; // v1 is prerelease, v2 is stable
  if (!v1IsPrerelease && v2IsPrerelease) return 1; // v1 is stable, v2 is prerelease

  // Extract version numbers (remove prerelease suffix)
  const cleanV1 = v1.split('-')[0];
  const cleanV2 = v2.split('-')[0];

  const a = cleanV1.split('.').map(Number);
  const b = cleanV2.split('.').map(Number);

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const num1 = a[i] || 0;
    const num2 = b[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  // If versions are equal, prerelease is considered older
  if (v1IsPrerelease && v2IsPrerelease) {
    return v1.localeCompare(v2); // Compare prerelease suffixes
  }

  return 0;
}

// Error parsing function
function parseError(error: any): ErrorInfo {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  const errorString = errorMessage.toLowerCase();

  // Network-related errors
  if (
    errorString.includes('network') ||
    errorString.includes('connection') ||
    errorString.includes('timeout') ||
    errorString.includes('fetch') ||
    errorString.includes('econnrefused') ||
    errorString.includes('enotfound') ||
    errorString.includes('github') ||
    errorString.includes('release') ||
    errorString.includes('feed')
  ) {
    return {
      message:
        'Network connection failed or update server unavailable. Please check your internet connection and try again.',
      type: 'network',
      details: errorMessage,
      retryable: true,
    };
  }

  // Permission-related errors
  if (
    errorString.includes('permission') ||
    errorString.includes('access') ||
    errorString.includes('eacces') ||
    errorString.includes('eperm')
  ) {
    return {
      message:
        'Permission denied. The application may not have sufficient privileges to perform this operation.',
      type: 'permission',
      details: errorMessage,
      retryable: false,
    };
  }

  // Version-related errors
  if (
    errorString.includes('version') ||
    errorString.includes('incompatible') ||
    errorString.includes('unsupported') ||
    errorString.includes('prerelease') ||
    errorString.includes('beta') ||
    errorString.includes('alpha')
  ) {
    return {
      message:
        'Version compatibility issue detected. The update may not be compatible with your system or may be a prerelease version.',
      type: 'version',
      details: errorMessage,
      retryable: false,
    };
  }

  // Download-related errors
  if (
    errorString.includes('download') ||
    errorString.includes('file') ||
    errorString.includes('write') ||
    errorString.includes('disk') ||
    errorString.includes('space')
  ) {
    return {
      message: 'Download failed. Please check your disk space and try again.',
      type: 'download',
      details: errorMessage,
      retryable: true,
    };
  }

  // System-related errors
  if (
    errorString.includes('system') ||
    errorString.includes('process') ||
    errorString.includes('memory') ||
    errorString.includes('resource')
  ) {
    return {
      message:
        'System resource error. Please restart the application and try again.',
      type: 'system',
      details: errorMessage,
      retryable: true,
    };
  }

  // Default case
  return {
    message: 'An unexpected error occurred. Please try again later.',
    type: 'unknown',
    details: errorMessage,
    retryable: true,
  };
}

const InstallationSettings: React.FC = () => {
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<UpdateSettingsInfo | null>(null);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);
  const [showRestartButton, setShowRestartButton] = useState(false);

  const checkForSettingsUpdates = useCheckForSettingsUpdates();
  const downloadUpdate = useDownloadUpdate();
  const restartUpdate = useRestartUpdate();

  const getCurrentVersion = async () => {
    try {
      const version = window.electron?.app?.version;
      if (!version) {
        throw new Error('Unable to retrieve application version');
      }
      setCurrentVersion(version);
    } catch (err: any) {
      const errorInfo = parseError(err);
      setError(errorInfo);
      setCurrentVersion('Unknown');
    }
  };

  const getSystemInfo = async () => {
    try {
      const { userAgent } = navigator;
      if (!userAgent) {
        throw new Error('Unable to detect system information');
      }

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
    } catch (err: any) {
      const errorInfo = parseError(err);
      setError(errorInfo);
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
    } catch (err: any) {
      const errorInfo = parseError(err);
      setError(errorInfo);
      toast.error(errorInfo.message);
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
      const errorInfo = parseError(err);
      setError(errorInfo);
      toast.error(errorInfo.message);
      setIsUpdating(false);
      setIsBlocking(false);
    }
  };

  const handleRestart = async () => {
    try {
      await restartUpdate();
    } catch (err: any) {
      const errorInfo = parseError(err);
      toast.error(errorInfo.message);
    }
  };

  const handleRetry = () => {
    setError(null);
    if (error?.type === 'network' || error?.type === 'download') {
      checkForUpdates();
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
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            error.retryable && (
              <Button color="inherit" size="small" onClick={handleRetry}>
                Retry
              </Button>
            )
          }
        >
          <Box>
            <Typography variant="body1" gutterBottom>
              {error.message}
            </Typography>
            {error.details && (
              <Typography variant="caption" color="textSecondary">
                Details: {error.details}
              </Typography>
            )}
          </Box>
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
