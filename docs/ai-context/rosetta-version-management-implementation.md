# Rosetta Version Management Implementation Plan

## Overview

**Goal**: Implement user-controlled Rosetta version management with first-run auto-installation while avoiding conflicts with existing DBT installation flow.

**Lessons Learned**: Previous attempts to implement comprehensive version management for all CLI tools caused conflicts with the existing DBT auto-installation process during first-run setup. The CLI adapter's shared process management led to race conditions and installation failures.

**Revised Approach**: Focus exclusively on Rosetta version management to provide immediate value while maintaining system stability.

**Key Principles**:

- **User Control**: No automatic Rosetta updates on startup after first installation
- **First-Run Auto-Install**: Automatically install latest stable Rosetta version on first application launch
- **Version Choice**: User selects specific Rosetta versions to install through Settings UI
- **Isolation**: Rosetta management completely isolated from DBT installation processes
- **Stability**: Avoid modifications to existing DBT auto-installation flow

---

## Implementation Strategy

### Rosetta-Only Focus

This implementation focuses **exclusively on Rosetta CLI version management** to avoid the conflicts encountered with DBT installation. Future implementations of Python and DBT version management should be undertaken separately with careful consideration of existing installation flows.

**Why Rosetta-Only**:

1. **Immediate Value**: Rosetta management provides significant user value
2. **Minimal Risk**: Rosetta operations don't interfere with DBT installation
3. **Independent Operation**: Rosetta can be managed without affecting other CLI tools
4. **Proven Implementation**: Successfully implemented and tested in isolation

---

## Detailed Implementation

### Phase 1: Service Layer Enhancement

#### Enhanced SettingsService (`src/main/services/settings.service.ts`)

**Add Rosetta Version Management Methods**:

```typescript
export default class SettingsService {
  /**
   * Check available Rosetta versions from GitHub releases
   * Returns current version info and all available versions
   */
  static async checkRosettaVersions(): Promise<RosettaVersionInfo> {
    const settings = await this.loadSettings();
    const currentVersion = settings.rosettaVersion;
    const currentPath = settings.rosettaPath;

    try {
      // Get all available versions from GitHub releases
      const response = await axios.get(
        'https://api.github.com/repos/adaptivescale/rosetta/releases',
        {
          headers: {
            'User-Agent': 'DBT-Studio',
          },
        },
      );
      const releases = response.data;

      const availableVersions = releases.map((release) => ({
        version: release.tag_name.replace(/^v/, ''),
        releaseDate: release.published_at,
        isPrerelease: release.prerelease,
        downloadUrl: this.getRosettaDownloadUrl(release),
        isNewer: this.compareVersions(release.tag_name, currentVersion) > 0,
        isOlder: this.compareVersions(release.tag_name, currentVersion) < 0,
        releaseNotes: release.body,
      }));

      return {
        currentVersion,
        currentPath,
        availableVersions,
        latestStable: releases
          .find((r) => !r.prerelease)
          ?.tag_name?.replace(/^v/, ''),
        latestPrerelease: releases
          .find((r) => r.prerelease)
          ?.tag_name?.replace(/^v/, ''),
        isRosettaConfigured: !!(currentPath && fs.existsSync(currentPath)),
      };
    } catch (error) {
      console.error('Failed to check Rosetta versions:', error);
      throw new Error('Failed to fetch Rosetta versions from GitHub');
    }
  }

  /**
   * Install specific Rosetta version
   * Downloads, extracts, and configures the specified version
   */
  static async installRosettaVersion(version: string): Promise<InstallResult> {
    try {
      const result = await this.downloadAndInstallRosetta(version);

      if (result.success) {
        const settings = await this.loadSettings();
        settings.rosettaVersion = version;
        settings.rosettaPath = result.path;
        await this.saveSettings(settings);
      }

      return result;
    } catch (error) {
      console.error(`Failed to install Rosetta version ${version}:`, error);
      return {
        success: false,
        version,
        path: '',
        error: error.message,
      };
    }
  }

  /**
   * Uninstall current Rosetta installation
   * Removes files and clears settings
   */
  static async uninstallRosetta(): Promise<void> {
    const settings = await this.loadSettings();

    if (settings.rosettaPath && fs.existsSync(settings.rosettaPath)) {
      const rosettaRoot = path.resolve(settings.rosettaPath, '../../');
      await fs.remove(rosettaRoot);
    }

    settings.rosettaVersion = '';
    settings.rosettaPath = '';
    await this.saveSettings(settings);
  }

  /**
   * Check if Rosetta is properly configured
   * Validates installation and executable permissions
   */
  static async isRosettaConfigured(): Promise<boolean> {
    const settings = await this.loadSettings();

    if (!settings.rosettaPath || !fs.existsSync(settings.rosettaPath)) {
      return false;
    }

    try {
      // Check if file is executable
      await fs.access(settings.rosettaPath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure Rosetta is installed on first run
   * Auto-installs latest stable version if no Rosetta is configured
   */
  static async ensureRosettaOnFirstRun(): Promise<void> {
    const isConfigured = await this.isRosettaConfigured();

    if (!isConfigured) {
      console.log(
        'First run detected - installing latest stable Rosetta version',
      );

      try {
        const versionInfo = await this.checkRosettaVersions();
        if (versionInfo.latestStable) {
          await this.installRosettaVersion(versionInfo.latestStable);
          console.log(
            `Successfully installed Rosetta version ${versionInfo.latestStable}`,
          );
        }
      } catch (error) {
        console.error('Failed to auto-install Rosetta on first run:', error);
        // Don't throw - let the application continue
      }
    }
  }

  /**
   * Download and install specific Rosetta version
   * Internal method for handling the download/extract process
   */
  private static async downloadAndInstallRosetta(
    version: string,
  ): Promise<InstallResult> {
    // Implementation similar to existing updateRosetta() but version-specific
    // This method handles the actual download, extraction, and file placement
    // Returns success/failure with path information
  }

  /**
   * Get download URL for specific Rosetta release
   * Determines correct platform-specific download URL
   */
  private static getRosettaDownloadUrl(release: any): string {
    // Platform-specific URL determination logic
    // Returns appropriate download URL for current platform
  }

  /**
   * Compare two semantic versions
   * Returns -1, 0, or 1 for version comparison
   */
  private static compareVersions(version1: string, version2: string): number {
    // Semantic version comparison logic
    // Used to determine newer/older versions
  }
}
```

### Phase 2: Modified Startup Flow

#### Updated Application Startup (`src/main/main.ts`)

**Remove automatic Rosetta updates and add first-run auto-install**:

```typescript
// In the startup sequence, REPLACE the automatic update calls:

// REMOVE these automatic update calls:
// await updateMessage('Downloading latest Rosetta release...');
// await SettingsService.updateRosetta();

// REPLACE with first-run auto-install and validation:
await updateMessage('Checking Rosetta installation...');

// Only auto-install on first run when no Rosetta is configured
await SettingsService.ensureRosettaOnFirstRun();

// Validate current installation
const isRosettaReady = await SettingsService.isRosettaConfigured();
if (isRosettaReady) {
  const settings = await SettingsService.loadSettings();
  await updateMessage(`Rosetta ready - version ${settings.rosettaVersion}`);
} else {
  await updateMessage(
    'Rosetta not configured - please set up in Settings > Rosetta',
  );
}
```

**Key Changes**:

- **No automatic updates** on every startup
- **First-run auto-install** when no Rosetta is detected
- **Validation only** on subsequent startups
- **Clear messaging** about Rosetta status

### Phase 3: Enhanced UI Component

#### Enhanced RosettaSettings Component (`src/renderer/components/settings/RosettaSettings.tsx`)

**Complete rewrite with version management features**:

```typescript
export const RosettaSettings: React.FC<RosettaSettingsProps> = ({
  settings,
  onSettingsChange,
}) => {
  const [versionInfo, setVersionInfo] = useState<RosettaVersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPrerelease, setShowPrerelease] = useState(false);

  // React Query hooks for version management
  const checkVersions = useCheckRosettaVersions();
  const installVersion = useInstallRosettaVersion();
  const uninstallRosetta = useUninstallRosetta();

  const handleCheckVersions = async () => {
    setIsLoading(true);
    try {
      const versions = await checkVersions.mutateAsync();
      setVersionInfo(versions);
      toast.success('Version information updated');
    } catch (error) {
      toast.error('Failed to check versions: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstallVersion = async (version: string) => {
    try {
      const result = await installVersion.mutateAsync(version);
      if (result.success) {
        toast.success(`Successfully installed Rosetta version ${version}`);
        await handleCheckVersions(); // Refresh version info
        onSettingsChange({ ...settings, rosettaVersion: version, rosettaPath: result.path });
      } else {
        toast.error(`Failed to install version ${version}: ${result.error}`);
      }
    } catch (error) {
      toast.error('Installation failed: ' + error.message);
    }
  };

  const handleUninstall = async () => {
    try {
      await uninstallRosetta.mutateAsync();
      toast.success('Rosetta has been uninstalled');
      setVersionInfo(null);
      onSettingsChange({ ...settings, rosettaVersion: '', rosettaPath: '' });
    } catch (error) {
      toast.error('Failed to uninstall: ' + error.message);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Current Installation Status */}
      <Typography variant="h6" gutterBottom>
        Rosetta CLI Installation
      </Typography>

      {settings.rosettaPath ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          <Typography variant="body1">
            <strong>Status:</strong> Installed and configured
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            <strong>Version:</strong> {settings.rosettaVersion || 'Unknown'}
          </Typography>
          <Typography variant="body2">
            <strong>Path:</strong> {settings.rosettaPath}
          </Typography>
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Rosetta is not installed. Please install a version below or it will be automatically installed on next restart.
        </Alert>
      )}

      {/* Version Management Section */}
      <Box sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          onClick={handleCheckVersions}
          disabled={isLoading || checkVersions.isLoading}
          startIcon={isLoading ? <CircularProgress size={16} /> : <Refresh />}
          sx={{ mb: 2 }}
        >
          Check Available Versions
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
      {versionInfo && (
        <RosettaVersionList
          versions={versionInfo.availableVersions.filter(v =>
            showPrerelease || !v.isPrerelease
          )}
          currentVersion={versionInfo.currentVersion}
          latestStable={versionInfo.latestStable}
          onInstall={handleInstallVersion}
          isInstalling={installVersion.isLoading}
        />
      )}

      {/* Uninstall Option */}
      {settings.rosettaPath && (
        <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" gutterBottom color="text.secondary">
            Danger Zone
          </Typography>
          <Button
            variant="outlined"
            color="error"
            onClick={handleUninstall}
            disabled={uninstallRosetta.isLoading}
            startIcon={uninstallRosetta.isLoading ? <CircularProgress size={16} /> : <Delete />}
          >
            Uninstall Rosetta
          </Button>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            This will remove all Rosetta files and reset the configuration.
          </Typography>
        </Box>
      )}
    </Box>
  );
};
```

#### Version List Component (`src/renderer/components/settings/RosettaVersionList.tsx`)

**Dedicated component for displaying and managing versions**:

```typescript
interface RosettaVersionListProps {
  versions: RosettaVersion[];
  currentVersion: string | null;
  latestStable: string | null;
  onInstall: (version: string) => void;
  isInstalling: boolean;
}

export const RosettaVersionList: React.FC<RosettaVersionListProps> = ({
  versions,
  currentVersion,
  latestStable,
  onInstall,
  isInstalling,
}) => {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Available Versions
      </Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Version</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Release Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {versions.map((version) => (
              <TableRow key={version.version}>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {version.version}
                  </Typography>
                  {version.version === latestStable && (
                    <Chip
                      label="Latest Stable"
                      size="small"
                      color="primary"
                      sx={{ ml: 1 }}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={version.isPrerelease ? 'Pre-release' : 'Stable'}
                    size="small"
                    color={version.isPrerelease ? 'warning' : 'success'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(version.releaseDate).toLocaleDateString()}
                  </Typography>
                </TableCell>
                <TableCell>
                  {version.version === currentVersion ? (
                    <Chip label="Installed" color="success" size="small" />
                  ) : version.isNewer ? (
                    <Chip label="Newer" color="info" size="small" />
                  ) : version.isOlder ? (
                    <Chip label="Older" color="default" size="small" />
                  ) : null}
                </TableCell>
                <TableCell align="right">
                  {version.version === currentVersion ? (
                    <Typography variant="body2" color="text.secondary">
                      Current
                    </Typography>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => onInstall(version.version)}
                      disabled={isInstalling}
                      startIcon={
                        isInstalling && selectedVersion === version.version ? (
                          <CircularProgress size={12} />
                        ) : version.isNewer ? (
                          <Upgrade />
                        ) : (
                          <Download />
                        )
                      }
                    >
                      {version.isNewer ? 'Upgrade' : version.isOlder ? 'Downgrade' : 'Install'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
```

### Phase 4: React Query Integration

#### Controllers (`src/renderer/controllers/settingsController.ts`)

**Add React Query hooks for Rosetta version management**:

```typescript
// Rosetta version management hooks
export const useCheckRosettaVersions = () => {
  return useMutation({
    mutationFn: async (): Promise<RosettaVersionInfo> => {
      return await ipcRenderer.invoke('settings:check-rosetta-versions');
    },
    onError: (error) => {
      console.error('Failed to check Rosetta versions:', error);
    },
  });
};

export const useInstallRosettaVersion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (version: string): Promise<InstallResult> => {
      return await ipcRenderer.invoke(
        'settings:install-rosetta-version',
        version,
      );
    },
    onSuccess: () => {
      // Invalidate settings queries to refresh UI
      queryClient.invalidateQueries(['settings']);
    },
    onError: (error) => {
      console.error('Failed to install Rosetta version:', error);
    },
  });
};

export const useUninstallRosetta = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      return await ipcRenderer.invoke('settings:uninstall-rosetta');
    },
    onSuccess: () => {
      // Invalidate settings queries to refresh UI
      queryClient.invalidateQueries(['settings']);
    },
    onError: (error) => {
      console.error('Failed to uninstall Rosetta:', error);
    },
  });
};
```

### Phase 5: IPC Handlers

#### IPC Handlers (`src/main/ipcHandlers/settingsHandlers.ts`)

**Add IPC handlers for Rosetta version management**:

```typescript
// Rosetta version management handlers
ipcMain.handle(
  'settings:check-rosetta-versions',
  async (): Promise<RosettaVersionInfo> => {
    try {
      return await SettingsService.checkRosettaVersions();
    } catch (error) {
      console.error('IPC Error - check-rosetta-versions:', error);
      throw error;
    }
  },
);

ipcMain.handle(
  'settings:install-rosetta-version',
  async (_, version: string): Promise<InstallResult> => {
    try {
      return await SettingsService.installRosettaVersion(version);
    } catch (error) {
      console.error('IPC Error - install-rosetta-version:', error);
      throw error;
    }
  },
);

ipcMain.handle('settings:uninstall-rosetta', async (): Promise<void> => {
  try {
    return await SettingsService.uninstallRosetta();
  } catch (error) {
    console.error('IPC Error - uninstall-rosetta:', error);
    throw error;
  }
});
```

### Phase 6: Type Definitions

#### Enhanced Types (`src/types/backend.ts`)

**Add comprehensive type definitions for Rosetta management**:

```typescript
export type RosettaVersion = {
  version: string;
  releaseDate: string;
  isPrerelease: boolean;
  downloadUrl: string;
  isNewer: boolean;
  isOlder: boolean;
  releaseNotes?: string;
};

export type RosettaVersionInfo = {
  currentVersion: string | null;
  currentPath: string | null;
  availableVersions: RosettaVersion[];
  latestStable: string | null;
  latestPrerelease?: string | null;
  isRosettaConfigured: boolean;
};

export type InstallResult = {
  success: boolean;
  version: string;
  path: string;
  error?: string;
  warnings?: string[];
  installLog?: string[];
};
```

---

## Critical Implementation Notes

### Avoiding CLI Adapter Conflicts

**Lesson Learned**: The CLI adapter's shared process management caused conflicts when multiple CLI operations ran simultaneously during first-run setup.

**Solutions Implemented**:

1. **Isolated Installation**: Rosetta installation uses separate download/extract logic
2. **No CLI Adapter Dependency**: Rosetta management doesn't use the shared CLI adapter
3. **First-Run Timing**: Auto-installation happens early in startup, before DBT processes
4. **Error Isolation**: Rosetta installation failures don't block application startup

### Testing Strategy

**Isolation Testing**:

- Test Rosetta installation independently of DBT installation
- Verify first-run auto-install works without conflicts
- Test version management UI operations in isolation

**Integration Testing**:

- Verify Rosetta management doesn't interfere with existing DBT flows
- Test startup sequence with and without existing Rosetta installation
- Validate settings persistence across application restarts

### Error Handling

**Graceful Degradation**:

- Rosetta installation failures don't block application startup
- Clear error messages guide users to manual installation
- Settings UI provides troubleshooting information

**User Feedback**:

- Toast notifications for all user-initiated actions
- Progress indicators for long-running operations
- Clear status indicators for installation state

---

## Implementation Timeline

### Week 1: Core Service Implementation

- [ ] Implement enhanced SettingsService methods
- [ ] Add first-run auto-installation logic
- [ ] Modify startup sequence in main.ts
- [ ] Add comprehensive error handling

### Week 2: UI Enhancement

- [ ] Rewrite RosettaSettings component
- [ ] Create RosettaVersionList component
- [ ] Add React Query hooks and controllers
- [ ] Implement IPC handlers

### Week 3: Testing & Polish

- [ ] Test first-run auto-installation
- [ ] Test version management operations
- [ ] Verify no conflicts with DBT installation
- [ ] Performance optimization and bug fixes

---

## Success Criteria

### Functional Requirements

✅ **User Control**: Users can manage Rosetta versions through Settings UI
✅ **First-Run Setup**: Latest stable Rosetta version automatically installed on first run
✅ **Version Choice**: Users can install specific versions (stable and pre-release)
✅ **Installation Status**: Clear indication of current Rosetta installation status
✅ **Uninstall Support**: Users can completely remove Rosetta installation

### Technical Requirements

✅ **No Startup Updates**: No automatic Rosetta updates on application startup (after first run)
✅ **Conflict Avoidance**: No interference with existing DBT installation processes
✅ **Error Resilience**: Graceful handling of installation failures
✅ **Settings Persistence**: Rosetta configuration properly saved and restored
✅ **Cross-Platform**: Works on macOS, Windows, and Linux

### User Experience Requirements

✅ **Clear Feedback**: Toast notifications for all actions
✅ **Progress Indication**: Loading states for long operations
✅ **Status Visibility**: Current installation status clearly displayed
✅ **Error Guidance**: Helpful error messages with actionable guidance
✅ **Release Information**: Access to release notes and version information

---

## Future Considerations

### Python Environment Management

When implementing Python version management in the future, consider:

- **Separate Implementation**: Don't combine with Rosetta management
- **DBT Dependency Awareness**: Understand impact on existing DBT installation
- **CLI Adapter Review**: Evaluate shared process management implications

### DBT Version Management

For future DBT version management implementation:

- **Installation Flow Analysis**: Thoroughly analyze existing auto-installation process
- **Adapter Conflicts**: Design around CLI adapter shared process limitations
- **Dependency Management**: Handle Python environment dependencies carefully

### Lessons for Future CLI Tool Management

1. **Isolation First**: Implement each CLI tool management independently
2. **Conflict Analysis**: Analyze existing installation flows before modifications
3. **Gradual Integration**: Add features incrementally with thorough testing
4. **Process Management**: Be cautious with shared process management patterns

This Rosetta-only implementation provides immediate value while maintaining system stability and avoiding the conflicts encountered in previous comprehensive approaches.
