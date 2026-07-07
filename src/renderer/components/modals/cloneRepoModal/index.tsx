import React from 'react';
import {
  Button,
  TextField,
  Box,
  FormControlLabel,
  Checkbox,
  Tooltip,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import GitIcon from '@mui/icons-material/Source';
import { Modal } from '../modal';
import { StyledForm } from './styles';
import { gitServices, projectsServices } from '../../../services';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  successCallback?: (project?: any) => void;
};

function isSshUrl(url: string): boolean {
  return url.startsWith('git@') || url.startsWith('ssh://');
}

export const CloneRepoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  successCallback,
}) => {
  const navigate = useNavigate();
  const [url, setUrl] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [removeGit, setRemoveGit] = React.useState(false);
  const [sshPassphrase, setSshPassphrase] = React.useState('');

  const isSSH = isSshUrl(url);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clone Repo">
      <StyledForm
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          try {
            const credentials =
              isSSH && sshPassphrase
                ? { username: '', password: '', sshPassphrase }
                : undefined;

            const { error, authRequired, path, name, connectionId } =
              await gitServices.gitClone(url, credentials, removeGit);

            if (error) {
              toast.error(error);
              setLoading(false);
              return;
            }
            if (authRequired) {
              toast.error('Authentication required!');
              setLoading(false);
              return;
            }
            if (!path || !name) {
              toast.error('Something went wrong!');
              setLoading(false);
              return;
            }
            const project = await projectsServices.addProjectFromVCS({
              path,
              name,
              connectionId,
            });
            await projectsServices.selectProject({ projectId: project.id });
            toast.success('Project cloned successfully!');
            onClose();
            navigate('/app/loading');
            successCallback?.(project);
          } catch (err: any) {
            toast.error(err.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            variant="outlined"
            placeholder="Enter repository URL (e.g., https://github.com/user/repo.git)"
            onChange={(event) => {
              setUrl(event.target.value);
              setSshPassphrase('');
            }}
            value={url}
            fullWidth
            autoFocus
            disabled={loading}
          />
          {isSSH && (
            <TextField
              variant="outlined"
              type="password"
              label="SSH Key Passphrase"
              placeholder="Leave empty if key has no passphrase"
              onChange={(event) => setSshPassphrase(event.target.value)}
              value={sshPassphrase}
              fullWidth
              disabled={loading}
            />
          )}
          <Tooltip
            title="Check this if you're cloning an external repository that you want to make your own. This removes the original .git history so you can initialize your own repository."
            placement="top"
          >
            <FormControlLabel
              control={
                <Checkbox
                  checked={removeGit}
                  onChange={(e) => setRemoveGit(e.target.checked)}
                  disabled={loading}
                />
              }
              label="Remove .git directory (for external repos)"
            />
          </Tooltip>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="outlined"
              disabled={url === '' || loading}
              startIcon={<GitIcon />}
            >
              {loading ? 'Cloning...' : 'Clone'}
            </Button>
          </Box>
        </Box>
      </StyledForm>
    </Modal>
  );
};
