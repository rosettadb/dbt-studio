import React, { useState } from 'react';
import {
  Button,
  Box,
  Chip,
  Typography,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch,
  Divider,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Backdrop,
} from '@mui/material';
import {
  OpenInNew,
  Refresh,
  Delete,
  Download,
  CheckCircle,
  Info,
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

interface RosettaSettingsProps {
  settings: SettingsType;
}

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
      toast.success('Version information updated');
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

  const handleCheckVersions = () => {
    checkVersions.mutate();
  };

  const handleInstallVersion = (version: string) => {
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
        (v) => showPrerelease || !v.isPrerelease,
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

  return (
    <Box sx={{ maxWidth: 800 }}>
      <Backdrop
        open={isBlocking}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      {/* Current Installation Status */}
      <Typography variant="h6" gutterBottom>
        Rosetta CLI Installation
      </Typography>

      {settings.rosettaPath ? (
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            Rosetta is installed at: {settings.rosettaPath}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Version: {settings.rosettaVersion || 'Unknown'}
          </Typography>
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body1">
            Rosetta is not installed. Please install a version below.
          </Typography>
        </Alert>
      )}

      {/* Version Management Section */}
      <Box sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          onClick={handleCheckVersions}
          disabled={checkVersions.isLoading}
          startIcon={
            checkVersions.isLoading ? (
              <CircularProgress size={16} />
            ) : (
              <Refresh />
            )
          }
          sx={{ mb: 2 }}
        >
          Check for Versions
        </Button>

        {versionInfo && (
          <FormControlLabel
            control={
              <Switch
                checked={showPrerelease}
                onChange={(e) => setShowPrerelease(e.target.checked)}
              />
            }
            label="Show pre-release versions"
            sx={{ ml: 2 }}
          />
        )}
      </Box>

      {/* Available Versions List */}
      {versionInfo && filteredVersions.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Available Versions
          </Typography>
          <List
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            {filteredVersions.map((version) => (
              <React.Fragment key={version.version}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {version.version}
                        </Typography>
                        {version.isPrerelease && (
                          <Chip
                            label="Pre-release"
                            size="small"
                            color="warning"
                          />
                        )}
                        {version.version === versionInfo.currentVersion && (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            <CheckCircle color="success" fontSize="small" />
                            <Chip
                              label="Installed"
                              size="small"
                              color="success"
                            />
                          </Box>
                        )}
                        {version.version === versionInfo.latestStable &&
                          !version.isPrerelease && (
                            <Chip label="Latest" size="small" color="primary" />
                          )}
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary">
                        Released:{' '}
                        {new Date(version.releaseDate).toLocaleDateString()}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {version.releaseNotes && (
                        <Tooltip title="View release notes">
                          <IconButton
                            size="small"
                            onClick={() =>
                              window.open(
                                `https://github.com/adaptivescale/rosetta/releases/tag/v${version.version}`,
                                '_blank',
                              )
                            }
                          >
                            <Info />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => handleInstallVersion(version.version)}
                        disabled={
                          version.version === versionInfo.currentVersion ||
                          installingVersion === version.version ||
                          installVersion.isLoading
                        }
                        startIcon={
                          installingVersion === version.version ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Download />
                          )
                        }
                      >
                        {getButtonText(version)}
                      </Button>
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>

          {/* Show All/Show Less Button */}
          {versionInfo &&
            versionInfo.availableVersions.filter(
              (v) => showPrerelease || !v.isPrerelease,
            ).length > 10 && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Button
                  variant="outlined"
                  onClick={() => setShowAllVersions(!showAllVersions)}
                  size="small"
                >
                  {showAllVersions ? 'Show Less' : 'Show All Versions'}
                </Button>
              </Box>
            )}
        </Box>
      )}

      {/* Documentation and Help */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Documentation
        </Typography>
        <Button
          startIcon={<OpenInNew />}
          color="primary"
          size="small"
          component="a"
          href="https://github.com/rosettadb/rosetta_cli?tab=readme-ov-file#getting-started"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) =>
            utils.handleExternalLink(
              e,
              'https://github.com/rosettadb/rosetta_cli?tab=readme-ov-file#getting-started',
            )
          }
          sx={{ textTransform: 'none' }}
        >
          View RosettaDB documentation
        </Button>
      </Box>

      {/* Uninstall Option */}
      {settings.rosettaPath && (
        <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="h6" gutterBottom color="error">
            Danger Zone
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Uninstalling Rosetta will remove all Rosetta files and reset the
              configuration. This action cannot be undone.
            </Typography>
          </Alert>
          <Button
            variant="outlined"
            color="error"
            onClick={handleUninstall}
            disabled={uninstallRosetta.isLoading}
            startIcon={
              uninstallRosetta.isLoading ? (
                <CircularProgress size={16} />
              ) : (
                <Delete />
              )
            }
          >
            {uninstallRosetta.isLoading
              ? 'Uninstalling...'
              : 'Uninstall Rosetta'}
          </Button>
        </Box>
      )}

      <ConfirmationModal
        isOpen={showUninstallConfirmation}
        onClose={cancelUninstall}
        onConfirm={confirmUninstall}
        title="Uninstall Rosetta"
        question="Are you sure you want to uninstall Rosetta? This will remove all Rosetta files and you will need to reinstall it to use Rosetta features."
      />
    </Box>
  );
};
