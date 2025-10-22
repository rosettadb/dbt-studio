# Version Management Implementation Plan for Rosetta and DBT

## Overview

This document outlines the implementation plan for user-controlled version management of Rosetta CLI and DBT Core/Adapters in the DBT Studio application. The goal is to remove automatic updates on application startup and move version management to the UI settings, allowing users to check for newer versions and decide whether to upgrade or downgrade.

## Current State Analysis

### Existing Automatic Updates (To Be Removed)

- **Application Startup**: `main.ts` automatically downloads latest Rosetta and Python
- **Auto-Update Flow**:

  ```typescript
  // In main.ts - TO BE REMOVED
  await updateMessage('Downloading latest Rosetta release...');
  await SettingsService.updateRosetta();

  await updateMessage('Embedding Python...');
  await SettingsService.updatePython();
  ```

### Current Version Management Infrastructure

- **Settings Storage**: Version information stored in `SettingsType`

  - `rosettaVersion: string`
  - `rosettaPath: string`
  - `dbtVersion: string`
  - `dbtPath: string`
  - `pythonVersion: string`
  - `pythonPath: string`

- **Existing Services**:
  - `SettingsService.updateRosetta()` - Downloads and installs Rosetta
  - `SettingsService.updatePython()` - Downloads and installs Python
  - `SettingsService.checkCliUpdates()` - Checks for CLI updates (partially implemented)

## Implementation Plan

### Overview: Three-Component Architecture

This implementation is divided into three independent but coordinated components:

1. **Rosetta CLI Management** - Version control for the Rosetta data transformation tool
2. **Python Environment Management** - Version control for the embedded Python runtime
3. **DBT Core & Adapters Management** - Version control for dbt-core and database adapters

Each component will have its own version management interface while sharing common infrastructure and UI patterns.

---

## Part 1: Rosetta CLI Version Management

### Phase 1.1: Remove Automatic Rosetta Updates

#### Modify Application Startup (`src/main/main.ts`)

**Current Behavior**: Auto-downloads latest Rosetta on every startup
**New Behavior**: Only validate existing Rosetta installation

```typescript
// REMOVE automatic Rosetta update call
// await SettingsService.updateRosetta();

// REPLACE with validation only
const settings = await SettingsService.loadSettings();
if (!settings.rosettaPath || !fs.existsSync(settings.rosettaPath)) {
  await updateMessage(
    'Rosetta not configured - please set up in Settings > Rosetta',
  );
} else {
  await updateMessage('Rosetta ready - version ' + settings.rosettaVersion);
}
```

### Phase 1.2: Rosetta Version Management Services

**New Methods in `src/main/services/settings.service.ts`:**

```typescript
export default class SettingsService {
  // Rosetta version management
  static async checkRosettaVersions(): Promise<RosettaVersionInfo> {
    const settings = await this.loadSettings();
    const currentVersion = settings.rosettaVersion;
    const currentPath = settings.rosettaPath;

    // Get all available versions from GitHub releases
    const response = await axios.get(
      'https://api.github.com/repos/adaptivescale/rosetta/releases',
    );
    const releases = response.data;

    const availableVersions = releases.map((release) => ({
      version: release.tag_name.replace(/^v/, ''),
      releaseDate: release.published_at,
      isPrerelease: release.prerelease,
      downloadUrl: this.getRosettaDownloadUrl(release),
      isNewer: this.compareVersions(release.tag_name, currentVersion) > 0,
      isOlder: this.compareVersions(release.tag_name, currentVersion) < 0,
    }));

    return {
      currentVersion,
      currentPath,
      availableVersions,
      latestStable: releases.find((r) => !r.prerelease)?.tag_name,
      latestPrerelease: releases.find((r) => r.prerelease)?.tag_name,
    };
  }

  static async installRosettaVersion(version: string): Promise<InstallResult> {
    // Install specific Rosetta version
    // Similar to current updateRosetta() but version-specific
    const result = await this.downloadAndInstallRosetta(version);

    if (result.success) {
      const settings = await this.loadSettings();
      settings.rosettaVersion = version;
      settings.rosettaPath = result.path;
      await this.saveSettings(settings);
    }

    return result;
  }

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
}
```

### Phase 1.3: Rosetta UI Component Enhancement

**File**: `src/renderer/components/settings/RosettaSettings.tsx`

**Enhanced Features**:

- Current version display with status indicator
- Available versions list with release information
- Install/Upgrade/Downgrade buttons
- Uninstall option
- Release notes integration
- Pre-release toggle

```typescript
export const RosettaSettings: React.FC<RosettaSettingsProps> = ({
  settings,
  onSettingsChange,
}) => {
  const [versionInfo, setVersionInfo] = useState<RosettaVersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPrerelease, setShowPrerelease] = useState(false);

  // Version management hooks
  const checkVersions = useCheckRosettaVersions();
  const installVersion = useInstallRosettaVersion();
  const uninstallRosetta = useUninstallRosetta();

  const handleCheckVersions = async () => {
    setIsLoading(true);
    try {
      const versions = await checkVersions.mutateAsync();
      setVersionInfo(versions);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstallVersion = async (version: string) => {
    await installVersion.mutateAsync(version);
    await handleCheckVersions(); // Refresh version info
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
            Rosetta is installed at: {settings.rosettaPath}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Version: {settings.rosettaVersion || 'Unknown'}
          </Typography>
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Rosetta is not installed. Please install a version below.
        </Alert>
      )}

      {/* Version Management Section */}
      <Box sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          onClick={handleCheckVersions}
          disabled={isLoading}
          startIcon={isLoading ? <CircularProgress size={16} /> : <Refresh />}
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
          />
        )}
      </Box>

      {/* Available Versions List */}
      {versionInfo && (
        <VersionList
          versions={versionInfo.availableVersions.filter(v =>
            showPrerelease || !v.isPrerelease
          )}
          currentVersion={versionInfo.currentVersion}
          onInstall={handleInstallVersion}
        />
      )}

      {/* Uninstall Option */}
      {settings.rosettaPath && (
        <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => uninstallRosetta.mutate()}
            startIcon={<Delete />}
          >
            Uninstall Rosetta
          </Button>
        </Box>
      )}
    </Box>
  );
};
```

---

## Part 2: Python Environment Management

### Phase 2.1: Remove Automatic Python Updates

#### Modify Application Startup (`src/main/main.ts`)

```typescript
// REMOVE automatic Python update call
// await SettingsService.updatePython();

// REPLACE with validation only
if (!settings.pythonPath || !fs.existsSync(settings.pythonPath)) {
  await updateMessage(
    'Python not configured - please set up in Settings > General',
  );
} else {
  await updateMessage('Python ready - version ' + settings.pythonVersion);
}
```

### Phase 2.2: Python Version Management Services

**New Methods in `src/main/services/settings.service.ts`:**

```typescript
export default class SettingsService {
  // Python version management
  static async checkPythonVersions(): Promise<PythonVersionInfo> {
    const settings = await this.loadSettings();
    const currentVersion = settings.pythonVersion;
    const currentPath = settings.pythonPath;

    // Get available Python versions from python-build-standalone
    const response = await axios.get(
      'https://api.github.com/repos/astral-sh/python-build-standalone/releases',
    );
    const releases = response.data;

    const availableVersions = releases
      .flatMap((release) => this.extractPythonVersionsFromRelease(release))
      .filter((version) => this.isPythonVersionSupported(version));

    return {
      currentVersion,
      currentPath,
      availableVersions,
      recommended: '3.10.17', // Current stable version
    };
  }

  static async installPythonVersion(version: string): Promise<InstallResult> {
    // Install specific Python version
    const result = await this.downloadAndInstallPython(version);

    if (result.success) {
      const settings = await this.loadSettings();
      settings.pythonVersion = version;
      settings.pythonPath = result.path;
      settings.pythonBinary = result.path;
      await this.saveSettings(settings);
    }

    return result;
  }

  static async uninstallPython(): Promise<void> {
    const settings = await this.loadSettings();
    if (settings.pythonPath && fs.existsSync(settings.pythonPath)) {
      const pythonRoot = path.resolve(settings.pythonPath, '../..');
      await fs.remove(pythonRoot);
    }

    settings.pythonVersion = '';
    settings.pythonPath = '';
    settings.pythonBinary = '';
    await this.saveSettings(settings);
  }

  private static extractPythonVersionsFromRelease(release: any) {
    // Extract Python versions from release assets
    // Filter by platform and architecture
    // Return structured version information
  }

  private static isPythonVersionSupported(version: string): boolean {
    // Check if Python version is supported (3.8+)
    const [major, minor] = version.split('.').map(Number);
    return major === 3 && minor >= 8;
  }
}
```

### Phase 2.3: Python UI Component Enhancement

**File**: `src/renderer/components/settings/PythonSettings.tsx` (New Component)

```typescript
export const PythonSettings: React.FC<PythonSettingsProps> = ({
  settings,
  onSettingsChange,
}) => {
  const [versionInfo, setVersionInfo] = useState<PythonVersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Version management hooks
  const checkVersions = useCheckPythonVersions();
  const installVersion = useInstallPythonVersion();
  const uninstallPython = useUninstallPython();

  return (
    <Box sx={{ p: 2 }}>
      {/* Current Installation Status */}
      <Typography variant="h6" gutterBottom>
        Python Environment
      </Typography>

      {settings.pythonPath ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          <Typography variant="body1">
            Python is installed at: {settings.pythonPath}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Version: {settings.pythonVersion || 'Unknown'}
          </Typography>
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Python is not installed. Please install a version below.
        </Alert>
      )}

      {/* Version Management */}
      <Button
        variant="outlined"
        onClick={() => checkVersions.mutate()}
        disabled={isLoading}
        startIcon={isLoading ? <CircularProgress size={16} /> : <Refresh />}
        sx={{ mb: 2 }}
      >
        Check for Python Versions
      </Button>

      {/* Python Version List */}
      {versionInfo && (
        <PythonVersionList
          versions={versionInfo.availableVersions}
          currentVersion={versionInfo.currentVersion}
          recommendedVersion={versionInfo.recommended}
          onInstall={(version) => installVersion.mutate(version)}
        />
      )}

      {/* Uninstall Option */}
      {settings.pythonPath && (
        <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => uninstallPython.mutate()}
            startIcon={<Delete />}
          >
            Uninstall Python Environment
          </Button>
        </Box>
      )}
    </Box>
  );
};
```

---

## Part 3: DBT Core & Adapters Management

### Phase 3.1: DBT Version Management Services

**Enhanced Methods in `src/main/services/settings.service.ts`:**

```typescript
export default class SettingsService {
  // DBT version management
  static async checkDbtVersions(): Promise<DbtVersionInfo> {
    const settings = await this.loadSettings();

    // Get current dbt-core version
    const currentCoreVersion = await this.getCurrentDbtCoreVersion();

    // Get current adapter versions
    const currentAdapters = await this.getCurrentDbtAdapters();

    // Check PyPI for available versions
    const coreVersions = await this.getDbtCoreVersionsFromPyPI();
    const adapterVersions = await this.getDbtAdapterVersionsFromPyPI();

    return {
      currentCoreVersion,
      currentAdapters,
      availableVersions: coreVersions,
      compatibleAdapters: adapterVersions,
    };
  }

  static async installDbtVersion(
    version: string,
    adapters: string[],
  ): Promise<InstallResult> {
    const settings = await this.loadSettings();
    const python = settings.pythonPath;

    if (!python) {
      throw new Error('Python environment not configured');
    }

    try {
      // Install dbt-core first
      await this.runPipInstall(python, `dbt-core==${version}`);

      // Install selected adapters
      for (const adapter of adapters) {
        await this.runPipInstall(python, `dbt-${adapter}`);
      }

      // Update dbt path
      const dbtPath = await this.getDbtExePath();
      settings.dbtPath = dbtPath;
      settings.dbtVersion = version;
      await this.saveSettings(settings);

      return {
        success: true,
        version,
        path: dbtPath,
      };
    } catch (error) {
      return {
        success: false,
        version,
        path: '',
        error: error.message,
      };
    }
  }

  static async uninstallDbt(): Promise<void> {
    const settings = await this.loadSettings();
    const python = settings.pythonPath;

    if (!python) return;

    // Get list of installed dbt packages
    const installedPackages = await this.getInstalledDbtPackages(python);

    // Uninstall all dbt packages
    for (const pkg of installedPackages) {
      await this.runPipUninstall(python, pkg);
    }

    settings.dbtPath = '';
    settings.dbtVersion = '';
    await this.saveSettings(settings);
  }

  private static async getCurrentDbtCoreVersion(): Promise<string | null> {
    // Implementation to get current dbt-core version
  }

  private static async getCurrentDbtAdapters(): Promise<{
    [adapter: string]: string;
  }> {
    // Implementation to get current adapter versions
  }

  private static async getDbtCoreVersionsFromPyPI(): Promise<any[]> {
    // Implementation to fetch dbt-core versions from PyPI
  }

  private static async getDbtAdapterVersionsFromPyPI(): Promise<any> {
    // Implementation to fetch adapter versions from PyPI
  }
}
```

### Phase 3.2: Enhanced DBT Settings Component

**File**: `src/renderer/components/settings/DbtSettings.tsx` (Enhanced)

**Key Improvements**:

- Separation of core vs adapter management
- Individual adapter version control
- Bulk operations for adapters
- Compatibility warnings

```typescript
export const DbtSettings: React.FC<DbtSettingsProps> = ({
  settings,
  onSettingsChange,
  onInstallDbtSave,
}) => {
  const [versionInfo, setVersionInfo] = useState<DbtVersionInfo | null>(null);
  const [selectedAdapters, setSelectedAdapters] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Version management hooks
  const checkVersions = useCheckDbtVersions();
  const installVersion = useInstallDbtVersion();
  const uninstallDbt = useUninstallDbt();

  return (
    <Box sx={{ p: 2 }}>
      {/* DBT Core Section */}
      <Typography variant="h6" gutterBottom>
        DBT Core
      </Typography>

      {settings.dbtPath && settings.dbtVersion ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          <Typography variant="body1">
            dbt™ Core is installed at: {settings.dbtPath}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Version: {settings.dbtVersion}
          </Typography>
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          dbt™ Core is not installed. Please install below.
        </Alert>
      )}

      {/* Version Check Button */}
      <Button
        variant="outlined"
        onClick={() => checkVersions.mutate()}
        disabled={isLoading}
        startIcon={isLoading ? <CircularProgress size={16} /> : <Refresh />}
        sx={{ mb: 3 }}
      >
        Check for DBT Versions
      </Button>

      {/* DBT Core Version Selection */}
      {versionInfo && (
        <>
          <Typography variant="h6" gutterBottom>
            Available DBT Core Versions
          </Typography>
          <DbtCoreVersionList
            versions={versionInfo.availableVersions}
            currentVersion={versionInfo.currentCoreVersion}
            onInstall={(version) => handleInstallCore(version)}
          />

          {/* Adapter Management Section */}
          <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
            Database Adapters
          </Typography>

          <AdapterSelectionGrid
            adapters={versionInfo.compatibleAdapters}
            selectedAdapters={selectedAdapters}
            onSelectionChange={setSelectedAdapters}
            currentlyInstalled={versionInfo.currentAdapters}
          />

          {/* Bulk Adapter Actions */}
          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={() => handleInstallAdapters(selectedAdapters)}
              disabled={selectedAdapters.length === 0}
            >
              Install Selected Adapters
            </Button>
            <Button
              variant="outlined"
              onClick={() => handleUpdateAllAdapters()}
            >
              Update All Adapters
            </Button>
          </Box>
        </>
      )}

      {/* Individual Adapter Management */}
      {versionInfo?.currentAdapters && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
            Installed Adapters
          </Typography>
          <InstalledAdaptersList
            adapters={versionInfo.currentAdapters}
            onUninstall={handleUninstallAdapter}
            onUpdate={handleUpdateAdapter}
          />
        </>
      )}

      {/* Complete Uninstall */}
      {settings.dbtPath && (
        <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => uninstallDbt.mutate()}
            startIcon={<Delete />}
          >
            Uninstall DBT Completely
          </Button>
        </Box>
      )}
    </Box>
  );

  // Helper functions for handling installations
  const handleInstallCore = async (version: string) => {
    await installVersion.mutateAsync({
      coreVersion: version,
      adapters: selectedAdapters,
    });
    await checkVersions.mutate(); // Refresh
  };

  const handleInstallAdapters = async (adapters: string[]) => {
    // Install adapters for current core version
  };

  const handleUpdateAllAdapters = async () => {
    // Update all installed adapters to latest compatible versions
  };

  const handleUninstallAdapter = async (adapter: string) => {
    // Uninstall specific adapter
  };

  const handleUpdateAdapter = async (adapter: string) => {
    // Update specific adapter
  };
};
```

---

## Shared Infrastructure

### Enhanced Type Definitions

**Add to `src/types/backend.ts`:**

```typescript
// Rosetta Types
export type RosettaVersionInfo = {
  currentVersion: string | null;
  currentPath: string | null;
  availableVersions: {
    version: string;
    releaseDate: string;
    isPrerelease: boolean;
    downloadUrl: string;
    isNewer: boolean;
    isOlder: boolean;
    releaseNotes?: string;
  }[];
  latestStable: string;
  latestPrerelease?: string;
};

// Python Types
export type PythonVersionInfo = {
  currentVersion: string | null;
  currentPath: string | null;
  availableVersions: {
    version: string;
    buildTag: string;
    platform: string;
    architecture: string;
    downloadUrl: string;
    isNewer: boolean;
    isOlder: boolean;
  }[];
  recommended: string;
};

// DBT Types
export type DbtVersionInfo = {
  currentCoreVersion: string | null;
  currentAdapters: { [adapter: string]: string };
  availableVersions: {
    version: string;
    releaseDate: string;
    isPrerelease: boolean;
    isNewer: boolean;
    isOlder: boolean;
    compatibilityNotes?: string;
  }[];
  compatibleAdapters: {
    [adapter: string]: {
      currentVersion: string | null;
      availableVersions: string[];
      latestVersion: string;
      compatibility: {
        [coreVersion: string]: string[]; // Compatible adapter versions for each core version
      };
    };
  };
};

// Shared Types
export type InstallResult = {
  success: boolean;
  version: string;
  path: string;
  error?: string;
  warnings?: string[];
  installLog?: string[];
};

export type ComponentVersionStatus = {
  component: 'rosetta' | 'python' | 'dbt';
  isInstalled: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  hasUpdate: boolean;
  installationPath: string | null;
  lastChecked: string | null;
};

export type VersionManagementSettings = {
  autoCheckUpdates: boolean;
  allowPrerelease: boolean;
  updateCheckInterval: number; // hours
  lastUpdateCheck: string;
  preferredPythonVersion: string;
  preferredDbtAdapters: string[];
};
```

### IPC Handlers for All Components

**File**: `src/main/ipcHandlers/versionManagement.ipcHandlers.ts`

```typescript
const registerVersionManagementHandlers = () => {
  // Rosetta version management
  ipcMain.handle('version:rosetta:check', async () => {
    return SettingsService.checkRosettaVersions();
  });

  ipcMain.handle('version:rosetta:install', async (_event, version: string) => {
    return SettingsService.installRosettaVersion(version);
  });

  ipcMain.handle('version:rosetta:uninstall', async () => {
    return SettingsService.uninstallRosetta();
  });

  // Python version management
  ipcMain.handle('version:python:check', async () => {
    return SettingsService.checkPythonVersions();
  });

  ipcMain.handle('version:python:install', async (_event, version: string) => {
    return SettingsService.installPythonVersion(version);
  });

  ipcMain.handle('version:python:uninstall', async () => {
    return SettingsService.uninstallPython();
  });

  // DBT version management
  ipcMain.handle('version:dbt:check', async () => {
    return SettingsService.checkDbtVersions();
  });

  ipcMain.handle(
    'version:dbt:install',
    async (_event, coreVersion: string, adapters: string[]) => {
      return SettingsService.installDbtVersion(coreVersion, adapters);
    },
  );

  ipcMain.handle('version:dbt:uninstall', async () => {
    return SettingsService.uninstallDbt();
  });

  ipcMain.handle(
    'version:dbt:install-adapter',
    async (_event, adapter: string, version?: string) => {
      return SettingsService.installDbtAdapter(adapter, version);
    },
  );

  ipcMain.handle(
    'version:dbt:uninstall-adapter',
    async (_event, adapter: string) => {
      return SettingsService.uninstallDbtAdapter(adapter);
    },
  );

  // Overall version status
  ipcMain.handle('version:status', async () => {
    return SettingsService.getOverallVersionStatus();
  });
};
```

### Frontend Controllers for All Components

**File**: `src/renderer/controllers/versionManagement.controller.ts`

```typescript
// Rosetta Controllers
export const useCheckRosettaVersions = () => {
  return useMutation({
    mutationFn: () =>
      window.electron.ipcRenderer.invoke('version:rosetta:check'),
  });
};

export const useInstallRosettaVersion = () => {
  return useMutation({
    mutationFn: (version: string) =>
      window.electron.ipcRenderer.invoke('version:rosetta:install', version),
  });
};

export const useUninstallRosetta = () => {
  return useMutation({
    mutationFn: () =>
      window.electron.ipcRenderer.invoke('version:rosetta:uninstall'),
  });
};

// Python Controllers
export const useCheckPythonVersions = () => {
  return useMutation({
    mutationFn: () =>
      window.electron.ipcRenderer.invoke('version:python:check'),
  });
};

export const useInstallPythonVersion = () => {
  return useMutation({
    mutationFn: (version: string) =>
      window.electron.ipcRenderer.invoke('version:python:install', version),
  });
};

export const useUninstallPython = () => {
  return useMutation({
    mutationFn: () =>
      window.electron.ipcRenderer.invoke('version:python:uninstall'),
  });
};

// DBT Controllers
export const useCheckDbtVersions = () => {
  return useMutation({
    mutationFn: () => window.electron.ipcRenderer.invoke('version:dbt:check'),
  });
};

export const useInstallDbtVersion = () => {
  return useMutation({
    mutationFn: ({
      coreVersion,
      adapters,
    }: {
      coreVersion: string;
      adapters: string[];
    }) =>
      window.electron.ipcRenderer.invoke(
        'version:dbt:install',
        coreVersion,
        adapters,
      ),
  });
};

export const useUninstallDbt = () => {
  return useMutation({
    mutationFn: () =>
      window.electron.ipcRenderer.invoke('version:dbt:uninstall'),
  });
};

export const useInstallDbtAdapter = () => {
  return useMutation({
    mutationFn: ({ adapter, version }: { adapter: string; version?: string }) =>
      window.electron.ipcRenderer.invoke(
        'version:dbt:install-adapter',
        adapter,
        version,
      ),
  });
};

export const useUninstallDbtAdapter = () => {
  return useMutation({
    mutationFn: (adapter: string) =>
      window.electron.ipcRenderer.invoke(
        'version:dbt:uninstall-adapter',
        adapter,
      ),
  });
};

// Overall status
export const useVersionStatus = () => {
  return useQuery({
    queryKey: ['version-status'],
    queryFn: () => window.electron.ipcRenderer.invoke('version:status'),
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
  });
};
```

---

## Implementation Timeline by Component

### Week 1-2: Rosetta Component

1. Remove automatic Rosetta updates from startup
2. Implement Rosetta version checking and installation services
3. Create enhanced RosettaSettings UI component
4. Add Rosetta-specific IPC handlers and controllers
5. Testing and bug fixes for Rosetta component

### Week 3-4: Python Component

1. Remove automatic Python updates from startup
2. Implement Python version checking and installation services
3. Create new PythonSettings UI component
4. Add Python-specific IPC handlers and controllers
5. Testing and bug fixes for Python component

### Week 5-6: DBT Component

1. Enhance existing DBT version management services
2. Completely rewrite DbtSettings component with new features
3. Add DBT-specific IPC handlers and controllers
4. Implement adapter-specific management
5. Testing and bug fixes for DBT component

### Week 7: Integration & Polish

1. Integration testing across all three components
2. Cross-platform testing
3. Performance optimization
4. UI/UX improvements
5. Documentation and final testing

---

## Component Dependencies

### Rosetta Component

- **Independent**: Can be developed and deployed separately
- **Dependencies**: None from other components
- **Used by**: Project extraction and dbt generation features

### Python Component

- **Independent**: Can be developed and deployed separately
- **Dependencies**: None from other components
- **Used by**: DBT component requires Python environment

### DBT Component

- **Dependent**: Requires Python component to be functional
- **Dependencies**: Python environment must be available
- **Used by**: Core dbt functionality throughout the application

This three-part division allows for:

- **Parallel development** of independent components
- **Modular testing** and deployment
- **Clear separation of concerns**
- **Easier maintenance** and troubleshooting

## Summary

This implementation plan divides the version management feature into three distinct, manageable components:

### 🔧 **Rosetta CLI Management**

- **Purpose**: Manage Rosetta data transformation tool versions
- **Scope**: GitHub releases, binary downloads, installation paths
- **UI Location**: Settings > Rosetta tab
- **Independence**: Fully independent component

### 🐍 **Python Environment Management**

- **Purpose**: Manage embedded Python runtime versions
- **Scope**: Python-build-standalone releases, environment setup
- **UI Location**: Settings > General tab (new Python section)
- **Independence**: Fully independent component

### 📊 **DBT Core & Adapters Management**

- **Purpose**: Manage dbt-core and database adapter versions
- **Scope**: PyPI packages, adapter compatibility, dependency resolution
- **UI Location**: Settings > dbt™ Core tab (enhanced)
- **Dependencies**: Requires Python component for functionality

### Key Benefits of This Approach:

1. **Modular Development**: Each component can be developed independently
2. **Clear Responsibilities**: Each component has a specific, well-defined scope
3. **Easier Testing**: Components can be tested in isolation
4. **Flexible Deployment**: Components can be rolled out incrementally
5. **Better Maintenance**: Issues can be isolated to specific components
6. **User Control**: Users have granular control over each tool's version

### Implementation Order:

1. **Rosetta** (Weeks 1-2) - Independent, can be completed first
2. **Python** (Weeks 3-4) - Independent, foundation for DBT
3. **DBT** (Weeks 5-6) - Depends on Python, most complex component
4. **Integration** (Week 7) - Testing and polish across all components

This approach transforms the application from auto-updating to user-controlled while maintaining clean separation of concerns and enabling incremental development.
