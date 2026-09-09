/* eslint-disable react/jsx-props-no-spreading */
import React from 'react';
import {
  Button,
  ButtonGroup,
  ClickAwayListener,
  Divider,
  Grow,
  Paper,
  Popper,
  MenuItem,
  MenuList,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useTheme, alpha } from '@mui/material/styles';

type Props = {
  title: string;
  disabled?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  tooltipTitle?: string;
  height?: number;
  /**
   * Optional handler for the primary (left) segment. Defaults to a no-op so
   * existing consumers that only use menuItems are unaffected.
   */
  onClick?: () => void;
  menuItems: {
    name: React.ReactNode;
    onClick: () => void;
    subTitle: string;
    leftIcon?: React.ReactNode;
    dividerBefore?: boolean;
  }[];
};

export const SplitButton: React.FC<Props> = ({
  title,
  disabled = false,
  isLoading = false,
  leftIcon,
  tooltipTitle = '',
  height = 28,
  onClick,
  menuItems,
}) => {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);

  const handleMenuItemClick = (index: number) => {
    menuItems[index].onClick();
    setOpen(false);
  };

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event: Event) => {
    if (
      anchorRef.current &&
      anchorRef.current.contains(event.target as HTMLElement)
    ) {
      return;
    }

    setOpen(false);
  };

  const renderIcon = React.useMemo(() => {
    if (isLoading) {
      return <CircularProgress size={16} sx={{ marginRight: '4px' }} />;
    }
    if (leftIcon) {
      return (
        <span
          style={{
            display: 'flex',
            marginRight: '4px',
            fontSize: '0.8rem',
          }}
        >
          {React.cloneElement(leftIcon as React.ReactElement, {
            fontSize: 'small',
            style: { fontSize: '14px' },
          })}
        </span>
      );
    }
    return null;
  }, [isLoading, leftIcon]);
  return (
    <>
      <Tooltip title={tooltipTitle}>
        <ButtonGroup
          variant="outlined"
          size="small"
          ref={anchorRef}
          aria-label="Button group with a nested menu"
          sx={{ height: `${height}px`, minHeight: `${height}px` }}
        >
          <Button
            size="small"
            onClick={onClick ?? (() => {})}
            sx={{
              padding: '2px 8px',
              fontSize: '0.8rem',
              minWidth: 'auto',
              fontWeight: 500,
              textTransform: 'none',
              cursor: onClick ? 'pointer' : 'default',
            }}
            disabled={isLoading || disabled}
          >
            {renderIcon}
            {title}
          </Button>
          <Button
            size="small"
            aria-controls={open ? 'split-button-menu' : undefined}
            aria-expanded={open ? 'true' : undefined}
            aria-label="select merge strategy"
            aria-haspopup="menu"
            onClick={handleToggle}
            sx={{
              padding: '2px 4px',
              minWidth: 'auto',
              color: theme.palette.primary.main,
            }}
            disabled={isLoading || disabled}
          >
            <ArrowDropDownIcon sx={{ fontSize: '1rem' }} />
          </Button>
        </ButtonGroup>
      </Tooltip>
      <Popper
        sx={{
          zIndex: 9999, // Increased from 1 to 9999 to ensure it appears above the editor
        }}
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
      >
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin:
                placement === 'bottom' ? 'center top' : 'center bottom',
            }}
          >
            <Paper sx={{ boxShadow: 1 }}>
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList
                  id="split-button-menu"
                  autoFocusItem
                  sx={{
                    paddingTop: '2px',
                    paddingBottom: '2px',
                  }}
                >
                  {menuItems.map((option, index) => (
                    <span
                      style={{ display: 'block' }}
                      key={`split-button-menu-${index}`}
                    >
                      {option.dividerBefore && <Divider sx={{ my: 0.5 }} />}
                      <MenuItem
                        onClick={() => handleMenuItemClick(index)}
                        sx={{
                          fontSize: '0.8rem',
                          minHeight: '24px',
                          padding: '4px 10px',
                          color: theme.palette.primary.main,
                          fontWeight: 500,
                          textTransform: 'none',
                          '&.Mui-selected': {
                            backgroundColor: alpha(
                              theme.palette.primary.main,
                              0.08,
                            ),
                          },
                          '&:hover': {
                            backgroundColor: alpha(
                              theme.palette.primary.main,
                              0.04,
                            ),
                          },
                        }}
                      >
                        {React.isValidElement(option.leftIcon) ? (
                          <span
                            style={{
                              display: 'flex',
                              marginRight: '4px',
                              fontSize: '0.8rem',
                            }}
                          >
                            {React.cloneElement(
                              option.leftIcon as React.ReactElement,
                              {
                                style: { fontSize: '14px' },
                              },
                            )}
                          </span>
                        ) : null}
                        {option.name}
                      </MenuItem>
                    </span>
                  ))}
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
};
