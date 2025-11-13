import React, { useState } from 'react';
import { Box, Typography, IconButton, Menu, MenuItem } from '@mui/material';
import { MoreHoriz, Refresh, Sync } from '@mui/icons-material';
import { useGitPull, useGitPush, useGetRemotes } from '../../controllers';

interface RepositoryHeaderProps {
  projectPath?: string;
  onRefresh?: () => void;
}

export const RepositoryHeader: React.FC<RepositoryHeaderProps> = ({
  projectPath,
  onRefresh,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { data: remotes = [] } = useGetRemotes(projectPath || '', {
    enabled: !!projectPath,
  });

  const { mutate: pull, isLoading: isPulling } = useGitPull({
    onSuccess: () => {
      onRefresh?.();
    },
  });

  const { mutate: push, isLoading: isPushing } = useGitPush({
    onSuccess: () => {
      onRefresh?.();
    },
  });

  const hasRemote = remotes.length > 0;

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handlePull = () => {
    if (projectPath && hasRemote) {
      pull({ path: projectPath });
    }
    handleMenuClose();
  };

  const handlePush = () => {
    if (projectPath && hasRemote) {
      push({ path: projectPath });
    }
    handleMenuClose();
  };

  const handleRefresh = () => {
    onRefresh?.();
    handleMenuClose();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        pt: 0.5,
        pb: 0.25,
        backgroundColor: 'background.paper',
      }}
    >
      {/* Header Title */}
      <Typography
        variant="h6"
        sx={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Changes
      </Typography>

      {/* Action Icons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {/* Refresh Button */}
        <IconButton
          size="small"
          onClick={handleRefresh}
          sx={{
            width: 24,
            height: 24,
            color: 'text.secondary',
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
        >
          <Refresh sx={{ fontSize: 16 }} />
        </IconButton>

        {/* Sync Button */}
        <IconButton
          size="small"
          disabled={!hasRemote}
          sx={{
            width: 24,
            height: 24,
            color: hasRemote ? 'text.secondary' : 'text.disabled',
            '&:hover': {
              backgroundColor: hasRemote ? 'action.hover' : 'transparent',
            },
          }}
        >
          <Sync sx={{ fontSize: 16 }} />
        </IconButton>

        {/* Three-dot Menu */}
        <IconButton
          size="small"
          onClick={handleMenuOpen}
          sx={{
            width: 24,
            height: 24,
            color: 'text.secondary',
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
        >
          <MoreHoriz sx={{ fontSize: 16 }} />
        </IconButton>

        {/* Dropdown Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          PaperProps={{
            sx: {
              minWidth: 180,
              mt: 0.5,
              '& .MuiMenuItem-root': {
                fontSize: '13px',
                py: 0.75,
              },
            },
          }}
        >
          <MenuItem onClick={handlePull} disabled={!hasRemote || isPulling}>
            {isPulling ? 'Pulling...' : 'Pull'}
          </MenuItem>
          <MenuItem onClick={handlePush} disabled={!hasRemote || isPushing}>
            {isPushing ? 'Pushing...' : 'Push'}
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Clone
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Checkout to...
          </MenuItem>
          <MenuItem onClick={handleRefresh}>Fetch</MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            View & Sort
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Commit
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Changes
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Pull, Push
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Branch
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Remote
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Stash
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Tags
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Worktrees
          </MenuItem>
          <MenuItem onClick={handleMenuClose} disabled>
            Show Git Output
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
};
