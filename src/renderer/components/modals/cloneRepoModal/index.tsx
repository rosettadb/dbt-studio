import React from 'react';
import { Button, TextField } from '@mui/material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { StyledForm } from './styles';
import { gitServices, projectsServices } from '../../../services';
import { useNavigate } from 'react-router-dom';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  successCallback?: () => void;
};

export const CloneRepoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  successCallback,
}) => {
  const navigate = useNavigate();
  const [url, setUrl] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clone Repo">
      <StyledForm
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          try {
            const { error, authRequired, path, name } =
              await gitServices.gitClone(url);
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
            });
            await projectsServices.selectProject({ projectId: project.id });
            navigate(`/app/loading`);
            successCallback?.();
          } catch (err: any) {
            toast.error(err.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <TextField
          variant="outlined"
          label="Clone Repo"
          onChange={(event) => setUrl(event.target.value)}
          value={url}
          fullWidth
        />
        <Button type="submit" variant="outlined" disabled={url === '' || loading}>
          {loading ? 'Cloning...' : 'Clone'}
        </Button>
      </StyledForm>
    </Modal>
  );
};
