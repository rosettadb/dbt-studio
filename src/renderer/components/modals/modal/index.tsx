import React, { ReactNode } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Breakpoint,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

type Props = {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  hideHeader?: boolean;
  maxWidth?: Breakpoint;
  fullScreen?: boolean;
};

export const Modal: React.FC<Props> = ({
  children,
  isOpen,
  onClose,
  title,
  hideHeader,
  maxWidth,
  fullScreen,
}) => {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullWidth
      maxWidth={maxWidth || 'sm'}
      fullScreen={fullScreen}
    >
      {!hideHeader ? (
        <DialogTitle>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            {title && <span>{title}</span>}
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
      ) : (
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            zIndex: 1,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      )}
      <DialogContent dividers={!hideHeader} sx={fullScreen ? { p: 0 } : {}}>
        {children}
      </DialogContent>
    </Dialog>
  );
};
