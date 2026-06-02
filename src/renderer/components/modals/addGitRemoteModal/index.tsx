import React from 'react';
import { Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { AddLink, CloudUpload } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { StyledForm } from './styles';
import { useAddGitRemote } from '../../../controllers';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  successCallback?: () => void;
  path: string;
};

export const AddGitRemoteModal: React.FC<Props> = ({
  isOpen,
  onClose,
  successCallback,
  path,
}) => {
  const { mutate: addRemote } = useAddGitRemote({
    onSuccess: () => {
      toast.success('Git remote successfully added!');
      onClose();
      successCallback?.();
    },
  });
  const [remote, setRemote] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) {
      setRemote('');
    }
  }, [isOpen]);

  const handleCreateRemote = React.useCallback(() => {
    window.open('https://github.com/new', '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add git remote">
      <Stack spacing={2}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Connect this project to a remote repository so you can push commits.
            Create a fresh remote or paste the URL of an existing one below.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            onClick={handleCreateRemote}
            variant="outlined"
            fullWidth
            startIcon={<CloudUpload fontSize="small" />}
          >
            Create new remote repository
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Need another provider? Open your Git host of choice, create a new
          repository, then paste its{' '}
          <Link
            underline="hover"
            href="https://docs.github.com/en/get-started/quickstart/create-a-repo"
            target="_blank"
            rel="noopener noreferrer"
          >
            HTTPS
          </Link>{' '}
          URL below.
        </Typography>
        <StyledForm
          onSubmit={async (event) => {
            event.preventDefault();
            addRemote({
              path,
              url: remote.trim(),
            });
          }}
        >
          <TextField
            variant="outlined"
            label="Existing remote URL"
            onChange={(event) => setRemote(event.target.value)}
            value={remote}
            fullWidth
            placeholder="https://github.com/org/repo.git"
          />
          <Button
            type="submit"
            variant="contained"
            disabled={remote.trim() === ''}
            startIcon={<AddLink fontSize="small" />}
          >
            Add origin
          </Button>
        </StyledForm>
      </Stack>
    </Modal>
  );
};
