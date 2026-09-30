/**
 * Python Runtime Picker
 * Select one of the managed python-build-standalone versions; installs the
 * interpreter on demand with download progress. Only managed downloads are
 * offered (no system interpreters).
 */

import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import {
  useInstallPythonRuntime,
  usePythonRuntimeInstallEvents,
  usePythonRuntimes,
} from '../../../controllers/pythonNotebooks.controller';
import type { PythonRuntimeInstallEvent } from '../../../../types/pythonNotebooks';

interface PythonRuntimePickerProps {
  value: string;
  onChange: (version: string) => void;
  /** Reported so the parent can disable its confirm button. */
  onReadyChange?: (ready: boolean) => void;
  label?: string;
  autoFocus?: boolean;
}

export const PythonRuntimePicker: React.FC<PythonRuntimePickerProps> = ({
  value,
  onChange,
  onReadyChange,
  label = 'Python version',
  autoFocus,
}) => {
  const { data: runtimes = [], isLoading } = usePythonRuntimes();
  const installRuntime = useInstallPythonRuntime();
  const [progress, setProgress] = useState<PythonRuntimeInstallEvent | null>(
    null,
  );

  usePythonRuntimeInstallEvents((event) => {
    if (event.version === value) {
      setProgress(event.phase === 'done' ? null : event);
    }
  });

  // Default to the recommended (or first installed) version
  useEffect(() => {
    if (value || runtimes.length === 0) return;
    const preferred =
      runtimes.find((r) => r.installed && r.isRecommended) ??
      runtimes.find((r) => r.installed) ??
      runtimes.find((r) => r.isRecommended) ??
      runtimes[0];
    onChange(preferred.version);
  }, [value, runtimes, onChange]);

  const selected = runtimes.find((r) => r.version === value);
  const isInstalling =
    installRuntime.isLoading && installRuntime.variables === value;
  const ready = Boolean(selected?.installed) && !isInstalling;

  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <FormControl fullWidth size="small">
          <InputLabel id="python-runtime-label">{label}</InputLabel>
          <Select
            labelId="python-runtime-label"
            label={label}
            value={value}
            autoFocus={autoFocus}
            disabled={isLoading || isInstalling}
            onChange={(e) => {
              setProgress(null);
              onChange(e.target.value);
            }}
            data-testid="python-runtime-select"
          >
            {runtimes.map((runtime) => (
              <MenuItem key={runtime.version} value={runtime.version}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    width: '100%',
                  }}
                >
                  <span>Python {runtime.version}</span>
                  {runtime.isRecommended && (
                    <Chip
                      label="recommended"
                      size="small"
                      sx={{ height: 18 }}
                    />
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    {runtime.installed ? 'installed' : 'not installed'}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {selected && !selected.installed && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => installRuntime.mutate(selected.version)}
            disabled={isInstalling}
            startIcon={
              isInstalling ? (
                <CircularProgress size={14} />
              ) : (
                <DownloadIcon fontSize="small" />
              )
            }
            sx={{ whiteSpace: 'nowrap' }}
          >
            {isInstalling ? 'Installing…' : 'Install'}
          </Button>
        )}
      </Box>

      {isInstalling && (
        <Box>
          <LinearProgress
            variant={
              progress?.phase === 'downloading' &&
              progress.percentage !== undefined
                ? 'determinate'
                : 'indeterminate'
            }
            value={progress?.percentage ?? 0}
          />
          <Typography variant="caption" color="text.secondary">
            {progress?.phase === 'extracting'
              ? 'Extracting…'
              : `Downloading Python ${selected?.version}${
                  progress?.percentage !== undefined
                    ? ` (${progress.percentage}%)`
                    : ''
                }`}
          </Typography>
        </Box>
      )}

      {selected && !selected.installed && !isInstalling && (
        <Typography variant="caption" color="text.secondary">
          This version is not installed yet. It is downloaded into the
          studio&apos;s managed interpreter directory and does not affect the
          dbt Python environment.
        </Typography>
      )}
    </Box>
  );
};

export default PythonRuntimePicker;
