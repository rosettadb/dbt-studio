import React, { useState } from 'react';
import { Button, Menu, MenuItem, ListItemIcon } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';

type Props = {
  items: { value: string; label: React.ReactNode }[];
  onSelect: (value: string) => void;
  selectedItem: string;
  anchorElement?: React.ReactNode;
};

export const SimpleDropdownMenu: React.FC<Props> = ({
  onSelect,
  selectedItem,
  items,
  anchorElement,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (value: string) => {
    onSelect(value);
    handleClose();
  };

  return (
    <>
      <Button
        id="dropdown-button"
        aria-controls={open ? 'dropdown-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={handleClick}
      >
        {anchorElement ?? 'Open'}
      </Button>
      <Menu
        id="dropdown-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          list: {
            'aria-labelledby': 'dropdown-button',
          },
        }}
      >
        {items.map((item) => (
          <MenuItem key={item.value} onClick={() => handleSelect(item.value)}>
            {item.label}
            {selectedItem === item.value && (
              <ListItemIcon sx={{ marginLeft: 2 }}>
                <CheckIcon fontSize="small" />
              </ListItemIcon>
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
