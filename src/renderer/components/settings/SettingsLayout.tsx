import React from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { Refresh } from '@mui/icons-material';

// Shared building blocks so every settings page has the same look:
// compact cards with a header strip (icon, title, description) and the
// card's rows underneath.

export const SettingsStack: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    {children}
  </Box>
);

interface SettingsSectionProps {
  title: string;
  icon?: React.ReactElement;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  icon,
  description,
  action,
  children,
}) => (
  <Box
    component="section"
    sx={(theme) => ({
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: 2,
      overflow: 'hidden',
      bgcolor: 'background.default',
    })}
  >
    <Box
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.75,
        py: 0.875,
        minHeight: 38,
        bgcolor: 'action.hover',
        borderBottom: `1px solid ${theme.palette.divider}`,
        '& > svg': {
          fontSize: 16,
          color: theme.palette.text.secondary,
          flexShrink: 0,
        },
      })}
    >
      {icon}
      <Typography sx={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
        {title}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          ml: 'auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={typeof description === 'string' ? description : undefined}
      >
        {description}
      </Typography>
      {action && (
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>{action}</Box>
      )}
    </Box>
    <Box
      sx={(theme) => ({
        '& > * + *': { borderTop: `1px solid ${theme.palette.divider}` },
      })}
    >
      {children}
    </Box>
  </Box>
);

interface SettingsRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  description,
  children,
}) => {
  // The visible label names the row, so screen readers announce it for the
  // control(s) on the right.
  const labelId = React.useId();
  return (
    <Box
      role={children ? 'group' : undefined}
      aria-labelledby={children ? labelId : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        px: 1.75,
        py: 0.875,
        minHeight: 40,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          id={labelId}
          variant="body2"
          fontWeight={500}
          component="div"
        >
          {label}
        </Typography>
        {description && (
          <Typography variant="caption" component="div" color="text.secondary">
            {description}
          </Typography>
        )}
      </Box>
      {children && (
        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            // The app theme makes every input 48px tall; keep rows compact.
            '& .MuiInputBase-root': { height: 32, fontSize: 13 },
          }}
        >
          {children}
        </Box>
      )}
    </Box>
  );
};

// Free-form content inside a section (lists, editors, empty states).
export const SettingsSectionBody: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <Box sx={{ px: 1.75, py: 1.25 }}>{children}</Box>;

// Shared look for tabs inside a settings page.
export const settingsTabsSx = {
  borderBottom: 1,
  borderColor: 'divider',
  minHeight: 34,
  '& .MuiTab-root': {
    minHeight: 34,
    py: 0.5,
    px: 1.5,
    fontSize: 13,
    textTransform: 'none',
  },
} as const;

type SettingsStatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

// A small coloured dot with text. Used for states (installed, connected,
// not found) instead of coloured chips, so colour stays quiet.
export const SettingsStatus: React.FC<{
  tone: SettingsStatusTone;
  children: React.ReactNode;
}> = ({ tone, children }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0.75,
      fontSize: 12,
      color: 'text.secondary',
      whiteSpace: 'nowrap',
    }}
  >
    <Box
      component="span"
      sx={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        flexShrink: 0,
        bgcolor: tone === 'neutral' ? 'text.disabled' : `${tone}.main`,
      }}
    />
    {children}
  </Box>
);

// Icon-only refresh button; the tooltip says what it refreshes.
export const SettingsRefreshButton: React.FC<{
  title: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}> = ({ title, onClick, loading = false, disabled = false }) => (
  <Tooltip title={title}>
    <span>
      <IconButton
        size="small"
        onClick={onClick}
        disabled={disabled || loading}
        aria-label={title}
      >
        {loading ? (
          <CircularProgress size={16} />
        ) : (
          <Refresh fontSize="small" />
        )}
      </IconButton>
    </span>
  </Tooltip>
);
