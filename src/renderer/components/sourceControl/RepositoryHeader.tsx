import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Tooltip,
  useTheme,
} from '@mui/material';
import { MoreHoriz, Sync } from '@mui/icons-material';
import { useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import {
  useGitPull,
  useGitPush,
  useGetRemotes,
  useGetBranches,
  useGitCreateBranch,
  useGitDeleteBranch,
  useGitRenameBranch,
  useGitCheckout,
} from '../../controllers';
import { BranchDialog } from './BranchDialog';
import { Icon } from '../icon';
import { icons } from '../../../../assets';
import { QUERY_KEYS } from '../../config/constants';
import { GitUiError, SshPassphraseModal } from '../modals';

function isSshUrl(url: string): boolean {
  return url.startsWith('git@') || url.startsWith('ssh://');
}

interface RepositoryHeaderProps {
  projectPath?: string;
  onSynchronize?: () => Promise<void>;
  isSynchronizing?: boolean;
  hasPendingChanges?: boolean;
  onGitError?: (error: GitUiError) => void;
}

export const RepositoryHeader: React.FC<RepositoryHeaderProps> = ({
  projectPath,
  onSynchronize,
  isSynchronizing,
  hasPendingChanges = false,
  onGitError,
}) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [branchMenuAnchor, setBranchMenuAnchor] = useState<null | HTMLElement>(
    null,
  );

  const emitGitError = React.useCallback(
    (error: GitUiError) => {
      onGitError?.(error);
    },
    [onGitError],
  );

  const { data: remotes = [] } = useGetRemotes(projectPath || '', {
    enabled: !!projectPath,
  });

  const { data: branches = [] } = useGetBranches(projectPath || '', {
    enabled: !!projectPath,
  });

  const { mutate: pull, isLoading: isPulling } = useGitPull({
    onSuccess: (data) => {
      if (data?.authRequired) {
        emitGitError({
          title: 'Authentication required',
          message:
            'Authentication is required to pull from the remote repository.',
          operation: 'pull',
          repoPath: projectPath,
        });
        return;
      }

      if (data?.error) {
        emitGitError({
          title: 'Pull failed',
          message: data.error,
          operation: 'pull',
          repoPath: projectPath,
        });
        return;
      }
      onSynchronize?.();
    },
    onError: (error) => {
      emitGitError({
        title: 'Pull failed',
        message: error.message ?? 'Unknown error',
        operation: 'pull',
        repoPath: projectPath,
      });
    },
  });

  const [sshPassphraseDialogOpen, setSshPassphraseDialogOpen] = useState(false);
  const [sshPassphraseAttempted, setSshPassphraseAttempted] = useState(false);

  // Close any pending SSH prompt from a previous project — this component
  // stays mounted across project switches, only projectPath changes.
  React.useEffect(() => {
    setSshPassphraseDialogOpen(false);
    setSshPassphraseAttempted(false);
  }, [projectPath]);

  const { mutate: push, isLoading: isPushing } = useGitPush({
    onSuccess: (data) => {
      if (data?.authRequired) {
        const originPushUrl = remotes.find((r) => r.name === 'origin')?.refs
          .push;
        if (originPushUrl && isSshUrl(originPushUrl)) {
          if (sshPassphraseAttempted) {
            toast.error('Incorrect SSH key passphrase. Please try again.');
          }
          setSshPassphraseDialogOpen(true);
          return;
        }
        emitGitError({
          title: 'Authentication required',
          message:
            'Authentication is required to push to the remote repository.',
          operation: 'push',
          repoPath: projectPath,
        });
        return;
      }

      if (data?.error) {
        emitGitError({
          title: 'Push failed',
          message: data.error,
          operation: 'push',
          repoPath: projectPath,
        });
        return;
      }
      setSshPassphraseDialogOpen(false);
      setSshPassphraseAttempted(false);
      onSynchronize?.();
    },
    onError: (error) => {
      emitGitError({
        title: 'Push failed',
        message: error.message ?? 'Unknown error',
        operation: 'push',
        repoPath: projectPath,
      });
    },
  });

  const handleSshPassphraseSubmit = (sshPassphrase: string) => {
    if (!projectPath) return;
    setSshPassphraseAttempted(true);
    push({
      path: projectPath,
      credentials: { username: '', password: '', sshPassphrase },
    });
  };

  const handleSshPassphraseCancel = () => {
    setSshPassphraseDialogOpen(false);
    setSshPassphraseAttempted(false);
  };

  // Branch operation state
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branchAction, setBranchAction] = useState<
    'create' | 'delete' | 'rename' | 'switch' | null
  >(null);
  const [branchInput, setBranchInput] = useState('');

  // Branch operation hooks
  const resetBranchDialog = React.useCallback(() => {
    setBranchDialogOpen(false);
    setBranchInput('');
    setBranchAction(null);
  }, []);

  const invalidateGitQueries = React.useCallback(async () => {
    if (!projectPath) return;
    await Promise.all([
      queryClient.invalidateQueries([QUERY_KEYS.GIT_BRANCHES, projectPath]),
      queryClient.invalidateQueries([QUERY_KEYS.GIT_STATUSES, projectPath]),
      queryClient.invalidateQueries([QUERY_KEYS.GIT_REMOTES, projectPath]),
    ]);
  }, [projectPath, queryClient]);

  const handlePostBranchOperation = React.useCallback(async () => {
    await Promise.all([
      invalidateGitQueries(),
      onSynchronize ? onSynchronize() : Promise.resolve(),
    ]);
    resetBranchDialog();
  }, [invalidateGitQueries, onSynchronize, resetBranchDialog]);

  const { mutate: createBranch, isLoading: isCreating } = useGitCreateBranch({
    onSuccess: async () => {
      await handlePostBranchOperation();
    },
    onError: (error) => {
      emitGitError({
        title: 'Failed to create branch',
        message: error.message ?? 'Unknown error',
        operation: 'branch:create',
        repoPath: projectPath,
      });
    },
  });

  const { mutate: deleteBranch, isLoading: isDeleting } = useGitDeleteBranch({
    onSuccess: async () => {
      await handlePostBranchOperation();
    },
    onError: (error) => {
      emitGitError({
        title: 'Failed to delete branch',
        message: error.message ?? 'Unknown error',
        operation: 'branch:delete',
        repoPath: projectPath,
      });
    },
  });

  const { mutate: renameBranch, isLoading: isRenaming } = useGitRenameBranch({
    onSuccess: async () => {
      await handlePostBranchOperation();
    },
    onError: (error) => {
      emitGitError({
        title: 'Failed to rename branch',
        message: error.message ?? 'Unknown error',
        operation: 'branch:rename',
        repoPath: projectPath,
      });
    },
  });

  const { mutate: switchBranch, isLoading: isSwitching } = useGitCheckout({
    onSuccess: async () => {
      await handlePostBranchOperation();
    },
    onError: (error) => {
      emitGitError({
        title: 'Failed to switch branch',
        message: error.message ?? 'Unknown error',
        operation: 'branch:switch',
        repoPath: projectPath,
      });
    },
  });

  const hasRemote = remotes.length > 0;

  const currentBranch = branches.find((b) => b.checkedOut)?.name || '';

  const handleBranchMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setBranchMenuAnchor(event.currentTarget);
  };

  const handleBranchMenuClose = () => {
    setBranchMenuAnchor(null);
  };

  const handlePull = () => {
    if (projectPath && hasRemote) {
      pull({ path: projectPath });
    }
    handleBranchMenuClose();
  };

  const handlePush = () => {
    if (projectPath && hasRemote) {
      push({ path: projectPath });
    }
    handleBranchMenuClose();
  };

  const handleSynchronize = async () => {
    try {
      await onSynchronize?.();
    } catch (error) {
      emitGitError({
        title: 'Synchronize failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        operation: 'sync',
        repoPath: projectPath,
      });
    }
  };

  const guardPendingChanges = (actionDescription: string) => {
    if (!hasPendingChanges) {
      return true;
    }
    emitGitError({
      title: 'Pending changes',
      message: `Please commit or discard all changes before ${actionDescription}.`,
      operation: 'guard:pending-changes',
      repoPath: projectPath,
    });
    return false;
  };

  const handleCreateBranch = () => {
    setBranchAction('create');
    setBranchInput('');
    setBranchDialogOpen(true);
    handleBranchMenuClose();
  };

  const handleRenameBranch = () => {
    if (currentBranch) {
      setBranchAction('rename');
      setBranchInput(currentBranch);
      setBranchDialogOpen(true);
      handleBranchMenuClose();
    }
  };

  const handleSwitchBranch = () => {
    if (!guardPendingChanges('switching branches')) {
      handleBranchMenuClose();
      return;
    }
    setBranchAction('switch');
    setBranchInput('');
    setBranchDialogOpen(true);
    handleBranchMenuClose();
  };

  const handleDeleteBranch = () => {
    if (!guardPendingChanges('deleting branches')) {
      handleBranchMenuClose();
      return;
    }
    setBranchAction('delete');
    setBranchInput('');
    setBranchDialogOpen(true);
    handleBranchMenuClose();
  };

  const handleBranchActionConfirm = () => {
    if (!projectPath || !branchInput) return;

    if (
      hasPendingChanges &&
      (branchAction === 'delete' || branchAction === 'switch')
    ) {
      guardPendingChanges('continuing with this branch action');
      setBranchDialogOpen(false);
      setBranchAction(null);
      setBranchInput('');
      return;
    }

    switch (branchAction) {
      case 'create':
        createBranch({ path: projectPath, branchName: branchInput });
        break;
      case 'delete':
        deleteBranch({ path: projectPath, branchName: branchInput });
        break;
      case 'rename':
        if (currentBranch) {
          renameBranch({
            path: projectPath,
            oldName: currentBranch,
            newName: branchInput,
          });
        }
        break;
      case 'switch':
        switchBranch({ path: projectPath, branch: branchInput });
        break;
      default:
        break;
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1,
        pt: 0.5,
        pb: 0.25,
        backgroundColor: 'background.paper',
      }}
    >
      {/* Header Title with Branch Name */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
        }}
      >
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
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {currentBranch && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <Icon
              src={icons.gitBranch}
              color={theme.palette.text.primary}
              width={14}
              height={14}
              style={{ marginTop: '-8px' }} // center the icon vertically
            />
            <Typography
              variant="caption"
              sx={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'text.secondary',
                maxWidth: 140,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentBranch}
            </Typography>
          </Box>
        )}
        {/* Action Icons */}
        <Tooltip title="Synchronize all changes">
          <IconButton
            size="small"
            onClick={handleSynchronize}
            disabled={isSynchronizing}
            sx={{
              width: 24,
              height: 24,
              color: isSynchronizing ? 'text.disabled' : 'text.secondary',
              animation: isSynchronizing ? 'spin 1s linear infinite' : 'none',
              '&:hover': {
                backgroundColor: isSynchronizing
                  ? 'transparent'
                  : 'action.hover',
              },
            }}
          >
            <Sync sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Actions Menu */}
        <Tooltip title="More Actions">
          <IconButton
            size="small"
            onClick={handleBranchMenuOpen}
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
        </Tooltip>

        {/* Menu Dropdown */}
        <Menu
          anchorEl={branchMenuAnchor}
          open={Boolean(branchMenuAnchor)}
          onClose={handleBranchMenuClose}
          PaperProps={{
            sx: {
              minWidth: 200,
              mt: 0.5,
              '& .MuiMenuItem-root': {
                fontSize: '13px',
                py: 0.75,
              },
            },
          }}
        >
          {/* Branch Operations */}
          <MenuItem
            onClick={handleSwitchBranch}
            disabled={isSwitching || isCreating || isDeleting || isRenaming}
          >
            Switch Branch
          </MenuItem>
          <MenuItem
            onClick={handleCreateBranch}
            disabled={isCreating || isDeleting || isRenaming}
          >
            Create Branch
          </MenuItem>
          <MenuItem
            onClick={handleRenameBranch}
            disabled={isRenaming || !branches.find((b) => b.checkedOut)}
          >
            Rename Branch
          </MenuItem>
          <MenuItem
            onClick={handleDeleteBranch}
            disabled={isDeleting || isCreating || isRenaming || isSwitching}
          >
            Delete Branch
          </MenuItem>
          <Divider />

          {/* Git Operations */}
          <MenuItem onClick={handlePull} disabled={!hasRemote || isPulling}>
            {isPulling ? 'Pulling...' : 'Pull'}
          </MenuItem>
          <MenuItem onClick={handlePush} disabled={!hasRemote || isPushing}>
            {isPushing ? 'Pushing...' : 'Push'}
          </MenuItem>
        </Menu>

        {/* Branch Dialog */}
        <BranchDialog
          open={branchDialogOpen}
          action={branchAction}
          inputValue={branchInput}
          onInputChange={setBranchInput}
          onConfirm={handleBranchActionConfirm}
          onCancel={() => {
            setBranchDialogOpen(false);
            setBranchInput('');
            setBranchAction(null);
          }}
          isLoading={isCreating || isDeleting || isRenaming || isSwitching}
          branches={branches}
        />

        {/* SSH Passphrase Dialog */}
        <SshPassphraseModal
          isOpen={sshPassphraseDialogOpen}
          isLoading={isPushing}
          onClose={handleSshPassphraseCancel}
          onSubmit={handleSshPassphraseSubmit}
        />
      </Box>
    </Box>
  );
};
