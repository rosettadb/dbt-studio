import React from 'react';
import {
  Box,
  ButtonBase,
  Divider,
  Menu,
  MenuItem,
  useTheme,
} from '@mui/material';
import {
  Add,
  Check,
  FormatListNumbered,
  KeyboardArrowDown,
} from '@mui/icons-material';

export type PanelHeaderDropdownItem = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  // Shown at the right end of the row, e.g. a "linked to project" icon.
  trailing?: React.ReactNode;
};

type Props = {
  items: PanelHeaderDropdownItem[];
  value?: string;
  onSelect: (value: string) => void;
  // Shown on the button when no item matches value.
  placeholder: string;
  // First row of the menu, e.g. "All Connections", opening the full list.
  // Hidden when there are no items.
  allLabel: string;
  onAll: () => void;
  // Last row of the menu, e.g. "Add connection". Also the only row when
  // there are no items.
  addLabel: string;
  onAdd: () => void;
  'data-testid'?: string;
};

// The picker each page shows in the left panel header, where the page title
// used to be: projects, connections, sources or instances.
export const PanelHeaderDropdown: React.FC<Props> = ({
  items,
  value,
  onSelect,
  placeholder,
  allLabel,
  onAll,
  addLabel,
  onAdd,
  'data-testid': testId,
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const selectedItem = items.find((item) => item.value === value);

  const menuChildren: React.ReactNode[] = [];
  if (items.length > 0) {
    menuChildren.push(
      <MenuItem
        key="all-item"
        onClick={() => {
          setAnchorEl(null);
          onAll();
        }}
        sx={{ fontSize: '0.8rem', gap: 1, minHeight: 32 }}
      >
        <FormatListNumbered sx={{ fontSize: 16 }} />
        {allLabel}
      </MenuItem>,
    );
  }
  items.forEach((item) => {
    menuChildren.push(
      <MenuItem
        // Prefixed so an item value can never clash with the All/Add keys
        key={`item:${item.value}`}
        selected={item.value === value}
        // Tells screen readers which item is the current one
        role="menuitemradio"
        aria-checked={item.value === value}
        onClick={() => {
          setAnchorEl(null);
          onSelect(item.value);
        }}
        sx={{ fontSize: '0.8rem', gap: 1, minHeight: 32 }}
      >
        {item.icon}
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </Box>
        {item.trailing}
        <Check
          sx={{
            fontSize: 16,
            visibility: item.value === value ? 'visible' : 'hidden',
          }}
        />
      </MenuItem>,
    );
  });
  if (items.length > 0) {
    menuChildren.push(<Divider key="add-divider" />);
  }
  menuChildren.push(
    <MenuItem
      key="add-item"
      onClick={() => {
        setAnchorEl(null);
        onAdd();
      }}
      sx={{ fontSize: '0.8rem', gap: 1, minHeight: 32 }}
    >
      <Add sx={{ fontSize: 16 }} />
      {addLabel}
    </MenuItem>,
  );

  return (
    <>
      <ButtonBase
        data-testid={testId}
        aria-haspopup="true"
        aria-expanded={anchorEl ? 'true' : undefined}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{
          flex: 1,
          minWidth: 0,
          height: 26,
          px: 0.75,
          gap: 0.75,
          justifyContent: 'flex-start',
          borderRadius: 1,
          fontSize: '0.8rem',
          fontWeight: 600,
          color: theme.palette.text.primary,
          '&:hover': { bgcolor: theme.palette.action.hover },
          '&.Mui-focusVisible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 1,
          },
        }}
      >
        {selectedItem?.icon}
        <Box
          component="span"
          sx={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {selectedItem?.label ?? placeholder}
        </Box>
        <KeyboardArrowDown sx={{ fontSize: 16, opacity: 0.7, flexShrink: 0 }} />
      </ButtonBase>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: { sx: { minWidth: 240, maxWidth: 360, maxHeight: 420 } },
        }}
      >
        {menuChildren}
      </Menu>
    </>
  );
};

export { buildConnectionDropdownItems } from './connectionItems';
