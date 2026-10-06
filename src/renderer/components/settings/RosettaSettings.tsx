import React, { useState, useEffect } from 'react';
import {
  Button,
  Box,
  Chip,
  Link,
  Typography,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Backdrop,
} from '@mui/material';
import {
  OpenInNew,
  Delete,
  TerminalOutlined,
  ListAltOutlined,
  WarningAmberOutlined,
  Download,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType, RosettaVersionInfo } from '../../../types/backend';
import { utils } from '../../helpers';
import { ConfirmationModal } from '../modals';
import {
  useCheckRosettaVersions,
  useInstallRosettaVersion,
  useUninstallRosetta,
} from '../../controllers';
import {
  SettingsRefreshButton,
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
  SettingsStatus,
} from './SettingsLayout';

interface RosettaSettingsProps {
  settings: SettingsType;
}

const MINIMUM_SUPPORTED_VERSION = '2.8.4';

// Helper function to compare semantic versions
const compareVersions = (a: string, b: string): number => {
  const parseVersion = (version: string) => {
    return version.replace(/^v/, '').split('.').map(Number);
  };

  const versionA = parseVersion(a);
  const versionB = parseVersion(b);

  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
    const numA = versionA[i] || 0;
    const numB = versionB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
};

const isVersionSupported = (version: string): boolean => {
  return compareVersions(version, MINIMUM_SUPPORTED_VERSION) >= 0;
};

export const RosettaSettings: React.FC<RosettaSettingsProps> = ({
  settings,
}) => {
  const [versionInfo, setVersionInfo] = useState<RosettaVersionInfo | null>(
    null,
  );
  const [showPrerelease, setShowPrerelease] = useState(false);
  const [installingVersion, setInstallingVersion] = useState<string | null>(
    null,
  );
  const [showUninstallConfirmation, setShowUninstallConfirmation] =
    useState(false);
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);

  // Version management hooks
  const checkVersions = useCheckRosettaVersions({
    onSuccess: (data) => {
      setVersionInfo(data);
    },
    onError: (error) => {
      toast.error(`Failed to check versions: ${error.message}`);
    },
  });

  const installVersion = useInstallRosettaVersion({
    onSuccess: (result) => {
      setInstallingVersion(null);
      setIsBlocking(false);
      if (result.success) {
        toast.success(`Rosetta ${result.version} installed successfully`);
        checkVersions.mutate();
      } else {
        toast.error(`Installation failed: ${result.error}`);
      }
    },
    onError: (error) => {
      setInstallingVersion(null);
      setIsBlocking(false);
      toast.error(`Installation failed: ${error.message}`);
    },
  });

  const uninstallRosetta = useUninstallRosetta({
    onSuccess: () => {
      setIsBlocking(false);
      toast.success('Rosetta uninstalled successfully');
      setVersionInfo(null);
    },
    onError: (error) => {
      setIsBlocking(false);
      toast.error(`Uninstall failed: ${error.message}`);
    },
  });

  // Auto-load versions on component mount
  useEffect(() => {
    checkVersions.mutate();
  }, []);

  const handleCheckVersions = () => {
    checkVersions.mutate();
  };

  const handleInstallVersion = (version: string) => {
    if (!isVersionSupported(version)) {
      toast.error(
        `Version ${version} is not supported. Minimum version required: ${MINIMUM_SUPPORTED_VERSION}`,
      );
      return;
    }

    setInstallingVersion(version);
    setIsBlocking(true);
    installVersion.mutate(version);
  };

  const handleUninstall = () => {
    setShowUninstallConfirmation(true);
  };

  const confirmUninstall = () => {
    setShowUninstallConfirmation(false);
    setIsBlocking(true);
    uninstallRosetta.mutate();
  };

  const cancelUninstall = () => {
    setShowUninstallConfirmation(false);
  };

  const filteredVersions = (() => {
    const filtered =
      versionInfo?.availableVersions.filter(
        (v) =>
          (showPrerelease || !v.isPrerelease) && isVersionSupported(v.version),
      ) || [];
    return showAllVersions ? filtered : filtered.slice(0, 10);
  })();

  const getButtonText = (version: any) => {
    if (version.version === versionInfo?.currentVersion) return 'Installed';
    if (installingVersion === version.version) return 'Installing...';
    if (version.isNewer) return 'Upgrade';
    if (version.isOlder) return 'Downgrade';
    return 'Install';
  };

  // Check if current version is unsupported
  const isCurrentVersionUnsupported =
    settings.rosettaVersion && !isVersionSupported(settings.rosettaVersion);

  return (
    <SettingsStack>
      <Backdrop
        open={isBlocking}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      <SettingsSection
        title="Rosetta CLI Installation"
        icon={<TerminalOutlined />}
        action={
          <Button
            size="small"
            startIcon={<OpenInNew />}
            color="primary"
            component="a"
            href="https://github.com/rosettadb/rosetta?tab=readme-ov-file#getting-started"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) =>
              utils.handleExternalLink(
                e,
                'https://github.com/rosettadb/rosetta?tab=readme-ov-file#getting-started',
              )
            }
          >
            Documentation
          </Button>
        }
      >
        <SettingsRow
          label="Status"
          description={
            settings.rosettaPath
              ? `${settings.rosettaPath}${
                  isCurrentVersionUnsupported
                    ? ` · This version is not supported. Please upgrade to version ${MINIMUM_SUPPORTED_VERSION} or higher.`
                    : ''
                }`
              : `Rosetta is not installed. Please install a version below (minimum: ${MINIMUM_SUPPORTED_VERSION}).`
          }
        >
          {settings.rosettaPath ? (
            <SettingsStatus
              tone={isCurrentVersionUnsupported ? 'warning' : 'success'}
            >
              Installed · {settings.rosettaVersion || 'Unknown'}
            </SettingsStatus>
          ) : (
            <SettingsStatus tone="warning">Not installed</SettingsStatus>
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Available Versions"
        icon={<ListAltOutlined />}
        action={
          <>
            {versionInfo && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={showPrerelease ? 'all' : 'stable'}
                onChange={(_, value) =>
                  value && setShowPrerelease(value === 'all')
                }
                aria-label="Which versions to show"
                sx={{
                  '& .MuiToggleButton-root': {
                    px: 1.25,
                    py: 0.25,
                    fontSize: 12,
                    textTransform: 'none',
                  },
                }}
              >
                <ToggleButton value="stable">Stable</ToggleButton>
                <ToggleButton value="all">All</ToggleButton>
              </ToggleButtonGroup>
            )}
            <SettingsRefreshButton
              title="Refresh versions"
              onClick={handleCheckVersions}
              loading={checkVersions.isLoading}
            />
          </>
        }
      >
        {!versionInfo && (
          <SettingsRow
            label={
              checkVersions.isLoading
                ? 'Loading available versions...'
                : 'No version information yet.'
            }
          />
        )}
        {versionInfo && filteredVersions.length === 0 && (
          <SettingsRow
            label="No supported versions found."
            description={
              !showPrerelease
                ? 'Try switching to All to include pre-release versions.'
                : undefined
            }
          />
        )}
        {versionInfo &&
          filteredVersions.map((version) => (
            <SettingsRow
              key={version.version}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {version.releaseNotes ? (
                    <Tooltip title="View release notes">
                      {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
                      <Link
                        component="button"
                        variant="body2"
                        underline="hover"
                        color="inherit"
                        fontWeight={500}
                        onClick={() =>
                          window.open(
                            `https://github.com/rosettadb/rosetta/releases/tag/v${version.version}`,
                            '_blank',
                          )
                        }
                      >
                        {version.version}
                      </Link>
                    </Tooltip>
                  ) : (
                    version.version
                  )}
                  {version.isPrerelease && (
                    <Chip
                      label="Pre-release"
                      size="small"
                      color="warning"
                      variant="outlined"
                    />
                  )}
                  {version.version === versionInfo.latestStable &&
                    !version.isPrerelease && (
                      <Chip label="Latest" size="small" variant="outlined" />
                    )}
                </Box>
              }
              description={`Released: ${new Date(
                version.releaseDate,
              ).toLocaleDateString()}`}
            >
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleInstallVersion(version.version)}
                disabled={
                  version.version === versionInfo.currentVersion ||
                  installingVersion === version.version ||
                  installVersion.isLoading
                }
                startIcon={
                  installingVersion === version.version ? (
                    <CircularProgress size={14} />
                  ) : (
                    <Download />
                  )
                }
              >
                {getButtonText(version)}
              </Button>
            </SettingsRow>
          ))}
        {versionInfo && (
          <SettingsSectionBody>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Minimum supported: {MINIMUM_SUPPORTED_VERSION}
              </Typography>
              {versionInfo.availableVersions.filter(
                (v) =>
                  (showPrerelease || !v.isPrerelease) &&
                  isVersionSupported(v.version),
              ).length > 10 && (
                <Button
                  size="small"
                  onClick={() => setShowAllVersions(!showAllVersions)}
                >
                  {showAllVersions
                    ? 'Show fewer versions'
                    : 'Show all versions'}
                </Button>
              )}
            </Box>
          </SettingsSectionBody>
        )}
      </SettingsSection>

      {settings.rosettaPath && (
        <SettingsSection title="Danger Zone" icon={<WarningAmberOutlined />}>
          <SettingsRow
            label="Uninstall Rosetta CLI"
            description="Removes all Rosetta files and resets the configuration. This cannot be undone."
          >
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={handleUninstall}
              disabled={uninstallRosetta.isLoading}
              startIcon={
                uninstallRosetta.isLoading ? (
                  <CircularProgress size={14} />
                ) : (
                  <Delete />
                )
              }
            >
              {uninstallRosetta.isLoading
                ? 'Uninstalling...'
                : 'Uninstall Rosetta CLI'}
            </Button>
          </SettingsRow>
        </SettingsSection>
      )}

      <ConfirmationModal
        isOpen={showUninstallConfirmation}
        onClose={cancelUninstall}
        onConfirm={confirmUninstall}
        title="Uninstall Rosetta CLI"
        question="Are you sure you want to uninstall Rosetta CLI? This will remove all Rosetta CLI files and you will need to reinstall it to use Rosetta CLI features."
      />
    </SettingsStack>
  );
};
