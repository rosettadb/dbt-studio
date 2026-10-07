import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Backdrop,
} from '@mui/material';
import {
  Download,
  CheckCircle,
  Update,
  Sync,
  DesktopWindowsOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useCheckForSettingsUpdates,
  useDownloadUpdate,
  useRestartUpdate,
} from '../../controllers';
import { UpdateSettingsInfo } from '../../../types/backend';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import { SettingsRow, SettingsSection } from './SettingsLayout';

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

      const normalizedUA = userAgent.toLowerCase();
      const appInfo = window.electron?.app;

      const detectOS = () => {
        const osFromMain = appInfo?.os?.toLowerCase();
        if (osFromMain === 'darwin') return 'macOS';
        if (osFromMain === 'win32') return 'Windows';
        if (osFromMain === 'linux') return 'Linux';

        if (normalizedUA.includes('mac os x')) return 'macOS';
        if (normalizedUA.includes('windows')) return 'Windows';
        if (normalizedUA.includes('linux')) return 'Linux';

        return 'Unknown';
      };

      const os = detectOS();

      const detectArch = () => {
        const archFromMain = appInfo?.arch?.toLowerCase();
        if (archFromMain) {
          if (archFromMain === 'arm64' || archFromMain === 'aarch64') {
            return 'ARM64';
          }
          if (archFromMain === 'x64' || archFromMain === 'x86_64') {
            return os === 'macOS' ? 'Intel' : 'x64';
          }
          if (archFromMain === 'ia32' || archFromMain === 'x86') {
            return 'x86';
          }
          if (archFromMain === 'universal') {
            return 'Universal';
          }
          return appInfo.arch;
        }

        if (
          normalizedUA.includes('arm64') ||
          normalizedUA.includes('aarch64') ||
          normalizedUA.includes('apple silicon')
        ) {
          return 'ARM64';
        }
        if (normalizedUA.includes('x86_64') || normalizedUA.includes('x64')) {
          if (os === 'macOS') {
            return 'Intel';
          }
          return 'x64';
        }
        if (normalizedUA.includes('i386') || normalizedUA.includes('x86')) {
          return 'x86';
        }
        if (normalizedUA.includes('intel')) {
          return 'Intel';
        }
        return 'Unknown';
      };
      const arch = detectArch();

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

  const sanitizedReleaseNotes = useMemo(
    () => sanitizeHtml(updateInfo?.releaseNotes ?? ''),
    [updateInfo?.releaseNotes],
  );

  const systemRows = [
    ['Operating system', systemInfo?.platform],
    ['Architecture', systemInfo?.arch],
    ['Electron version', systemInfo?.electronVersion],
    ['Chrome version', systemInfo?.chromeVersion],
  ];

  return (
    <>
      <Backdrop
        open={isBlocking}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
      {error && (
        <Alert
          severity="error"
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
      <SettingsSection title="Updates" icon={<Sync />}>
        <SettingsRow
          label="Current version"
          description={
            lastChecked
              ? `Last checked: ${lastChecked.toLocaleString()}`
              : undefined
          }
        >
          <Chip
            size="small"
            label={currentVersion}
            color="primary"
            variant="outlined"
            icon={<CheckCircle />}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={checkForUpdates}
            disabled={isCheckingForUpdates}
            startIcon={
              isCheckingForUpdates ? (
                <CircularProgress size={14} />
              ) : (
                <Download />
              )
            }
          >
            {isCheckingForUpdates ? 'Checking...' : 'Check for Updates'}
          </Button>
        </SettingsRow>
        {latestVersion && (
          <SettingsRow
            label="Latest version"
            description={
              isUpdateAvailable
                ? `A new version (${latestVersion}) is available!`
                : `You are running the latest version (${currentVersion})`
            }
          >
            <Chip
              size="small"
              label={latestVersion}
              color={isUpdateAvailable ? 'warning' : 'success'}
              variant="outlined"
              icon={<Update />}
            />
            {isUpdateAvailable && !showRestartButton && (
              <Button
                size="small"
                variant="contained"
                color="primary"
                onClick={handleUpdate}
                disabled={isUpdating}
                startIcon={
                  isUpdating ? <CircularProgress size={14} /> : <Download />
                }
              >
                {isUpdating ? 'Downloading...' : 'Update Now'}
              </Button>
            )}
            {isUpdateAvailable && showRestartButton && (
              <Button
                size="small"
                onClick={handleRestart}
                color="secondary"
                variant="outlined"
                disabled={isUpdating}
              >
                Restart Now
              </Button>
            )}
          </SettingsRow>
        )}
        {isUpdateAvailable && updateInfo?.releaseNotes && (
          <Box sx={{ px: 1.75, py: 1.25 }}>
            <Typography variant="caption" color="textSecondary">
              Release Notes:
            </Typography>
            <Typography
              variant="body2"
              dangerouslySetInnerHTML={{
                __html: sanitizedReleaseNotes,
              }}
            />
          </Box>
        )}
      </SettingsSection>
      <SettingsSection title="System" icon={<DesktopWindowsOutlined />}>
        {systemRows.map(([label, value]) => (
          <SettingsRow key={label} label={label}>
            <Typography variant="body2" color="textSecondary">
              {value || 'Loading...'}
            </Typography>
          </SettingsRow>
        ))}
        {systemInfo?.userAgent && (
          <SettingsRow
            label="User agent"
            description={
              <Box component="span" sx={{ wordBreak: 'break-all' }}>
                {systemInfo.userAgent}
              </Box>
            }
          />
        )}
      </SettingsSection>
    </>
  );
};

export { InstallationSettings };
