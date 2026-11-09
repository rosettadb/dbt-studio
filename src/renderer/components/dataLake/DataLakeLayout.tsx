import React from 'react';
import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TableContainer,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { MoreVert } from '@mui/icons-material';
import {
  SettingsSectionBody,
  settingsTabsSx,
} from '../settings/SettingsLayout';

// Shared look for the DataLake screens, following the Settings redesign
// (components/settings/SettingsLayout.tsx): an 18px page title with a
// one-line description, compact small buttons, bordered cards, dense
// tables, and row actions behind one three-dot menu.

// On a touchscreen (finger or pen), give each compact button an invisible
// 44px-high hit area (at least 44px wide) centred on it, so the buttons keep
// their compact look but are easy to tap. Mouse-only setups don't get it.
const touchHitAreaSx = {
  '@media (any-pointer: coarse)': {
    '&::after': {
      content: '""',
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '100%',
      minWidth: 44,
      height: 44,
      transform: 'translate(-50%, -50%)',
    },
  },
} as const;

// Compact small buttons, same values as the Settings pages
// (screens/settings/styles.ts). Put it on the root of a DataLake page.
// minHeight keeps the target at the WCAG 2.2 AA minimum (24px, SC 2.5.8):
// 12px text x 1.6 plus the padding is only 23.2px on its own.
export const dataLakePageSx = {
  '& .MuiButton-sizeSmall': {
    fontSize: 12,
    lineHeight: 1.6,
    padding: '2px 8px',
    minWidth: 0,
    minHeight: 24,
    ...touchHitAreaSx,
    '& .MuiButton-startIcon': {
      marginRight: '4px',
      marginLeft: '-2px',
      '& > *:nth-of-type(1)': { fontSize: 15 },
    },
  },
  '& .MuiButton-outlinedSizeSmall': {
    padding: '1px 7px',
  },
} as const;

// Same compact buttons for dialogs. Dialogs render in a portal, so the page
// root's rules above don't reach them: put this on each Dialog's paper
// (slotProps={{ paper: { sx: dataLakeDialogSx } }}).
export const dataLakeDialogSx = {
  '& .MuiButton-root': {
    fontSize: 12,
    lineHeight: 1.6,
    padding: '2px 8px',
    minWidth: 0,
    minHeight: 24, // WCAG 2.2 AA target size, as above
    ...touchHitAreaSx,
    '& .MuiButton-startIcon': {
      marginRight: '4px',
      marginLeft: '-2px',
      '& > *:nth-of-type(1)': { fontSize: 15 },
    },
    '& .MuiButton-endIcon': {
      marginLeft: '4px',
      marginRight: '-2px',
      '& > *:nth-of-type(1)': { fontSize: 15 },
    },
  },
  '& .MuiButton-outlined': {
    padding: '1px 7px',
  },
} as const;

// Tabs as on the Settings pages (plain row, divider under it, set straight
// on the page, 18px below), plus a 16px start icon on every tab.
export const dataLakeTabsSx = {
  ...settingsTabsSx,
  mb: 2.25,
  '& .MuiTab-icon, & .MuiTab-iconWrapper': { fontSize: 16, mr: 0.75 },
} as const;

// Padding for a DataLake page's content. With the screen's own 16px it
// matches the Settings pages (22px top, 28px sides).
export const dataLakeContentSx = { px: 1.5, pt: 0.75, pb: 3 } as const;

interface DataLakePageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  // Shown before the title (a logo, or a back button).
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export const DataLakePageHeader: React.FC<DataLakePageHeaderProps> = ({
  title,
  description,
  icon,
  actions,
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      mb: 2,
      flexWrap: 'wrap',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      {icon}
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="h1"
          sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.4 }}
          noWrap
        >
          {title}
        </Typography>
        {description && (
          <Typography
            component="p"
            color="text.secondary"
            sx={{ fontSize: 12.5 }}
          >
            {description}
          </Typography>
        )}
      </Box>
    </Box>
    {actions && (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {actions}
      </Box>
    )}
  </Box>
);

// Dense tables in the Settings look. The column header row is a filled
// stripe in the same colour as a Settings section strip, so a section that
// holds a table reads as one header block (title strip + column labels).
// Column labels are 11px uppercase, like the sidebar group labels. Rows use
// the Settings row padding and 13px text. The rules target descendants, so
// they can sit on the TableContainer.
export const dataLakeTableSx = {
  '& .MuiTableCell-root': {
    px: 1.75,
    py: 0.875,
    fontSize: 13,
    borderColor: 'divider',
  },
  '& .MuiTableCell-head': {
    py: 0.625,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.6,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'text.secondary',
    whiteSpace: 'nowrap',
    // The strip colour laid over the card colour, so sticky headers stay
    // opaque while rows scroll under them.
    bgcolor: 'background.default',
    backgroundImage: (theme: Theme) =>
      `linear-gradient(${theme.palette.action.hover}, ${theme.palette.action.hover})`,
  },
  '& .MuiTableCell-head .MuiTableSortLabel-root': {
    color: 'inherit',
    '&.Mui-active': { color: 'text.primary' },
  },
  // Clickable rows: a light tint, softer than the header stripe.
  '& .MuiTableRow-hover:hover': {
    bgcolor: (theme: Theme) => alpha(theme.palette.text.primary, 0.04),
  },
  '& .MuiTableBody-root .MuiTableRow-root:last-of-type > .MuiTableCell-root': {
    borderBottom: 0,
  },
} as const;

interface DataLakeTableContainerProps {
  children: React.ReactNode;
  // Leave the border off when the table already sits inside a card.
  bordered?: boolean;
  maxHeight?: number | string;
  sx?: SxProps<Theme>;
}

export const DataLakeTableContainer: React.FC<DataLakeTableContainerProps> = ({
  children,
  bordered = true,
  maxHeight,
  sx,
}) => (
  <TableContainer
    sx={[
      dataLakeTableSx,
      bordered && {
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.default',
      },
      maxHeight !== undefined && { maxHeight },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
  </TableContainer>
);

export interface DataLakeRowAction {
  key: string;
  label: string;
  icon: React.ReactElement;
  onClick: () => void;
  disabled?: boolean;
  // Shown under the label while the action is disabled.
  disabledReason?: string;
  // Destructive actions are red and sit below a divider.
  danger?: boolean;
  hidden?: boolean;
}

interface DataLakeRowActionsProps {
  actions: DataLakeRowAction[];
  // Accessible name of the three-dot button, e.g. "Actions for orders".
  label: string;
  disabled?: boolean;
}

// One three-dot button per table row instead of a row of icon buttons.
// Clicks never reach the row, so rows can still open on click.
export const DataLakeRowActions: React.FC<DataLakeRowActionsProps> = ({
  actions,
  label,
  disabled = false,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const menuId = React.useId();
  const open = Boolean(anchorEl);
  const visibleActions = actions.filter((action) => !action.hidden);

  if (visibleActions.length === 0) return null;

  const handleClose = () => setAnchorEl(null);

  return (
    <>
      <Tooltip title="Actions">
        <span>
          <IconButton
            size="small"
            aria-label={label}
            aria-haspopup="menu"
            aria-controls={open ? menuId : undefined}
            aria-expanded={open ? 'true' : undefined}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              setAnchorEl(event.currentTarget);
            }}
            sx={{
              // Keep the full click target without making the row taller.
              my: -0.5,
              // Touchscreens (finger or pen): an invisible 44px-wide tap area
              // around the 30px button; the icon stays the same. It is 36px
              // tall, not 44: rows are ~37px apart, so a taller area would
              // overlap the next row's button and open the wrong row's menu.
              '@media (any-pointer: coarse)': {
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 44,
                  height: 36,
                  transform: 'translate(-50%, -50%)',
                },
              },
            }}
          >
            <MoreVert fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        // The menu renders in a portal, but React still bubbles its clicks
        // (including the backdrop) up to the table row.
        onClick={(event) => event.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 168 } } }}
      >
        {visibleActions.flatMap((action, index) => {
          const items: React.ReactElement[] = [];
          if (action.danger && index > 0 && !visibleActions[index - 1].danger) {
            items.push(<Divider key={`${action.key}-divider`} />);
          }
          items.push(
            <MenuItem
              key={action.key}
              disabled={action.disabled}
              onClick={() => {
                handleClose();
                action.onClick();
              }}
              sx={{
                py: 0.5,
                minHeight: 'auto',
                color: action.danger ? 'error.main' : undefined,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 28,
                  color: action.danger ? 'error.main' : undefined,
                }}
              >
                {action.icon}
              </ListItemIcon>
              <ListItemText
                primary={action.label}
                secondary={action.disabled ? action.disabledReason : undefined}
                slotProps={{
                  primary: { sx: { fontSize: 13 } },
                  secondary: { sx: { fontSize: 11 } },
                }}
              />
            </MenuItem>,
          );
          return items;
        })}
      </Menu>
    </>
  );
};

// Empty or "not available" message inside a section card.
export const DataLakeSectionEmpty: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <SettingsSectionBody>
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  </SettingsSectionBody>
);
