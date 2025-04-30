import React from 'react';
import { Button, TextField } from '@mui/material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { StyledForm } from './styles';
import { gitServices, projectsServices } from '../../../services';

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
  const [url, setUrl] = React.useState('');
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clone Repo">
      <StyledForm
        onSubmit={async (event) => {
          event.preventDefault();
          const { error, authRequired, path, name } =
            await gitServices.gitClone(url);
          if (error) {
            toast.error(error);
            return;
          }
          if (authRequired) {
            toast.error('Authentication required!');
            return;
          }

          if (!path || !name) {
            toast.error('Something went wrong!');
            return;
          }
          try {
            const project = await projectsServices.addProjectFromVCS({
              path,
              name,
            });
            await projectsServices.selectProject({ projectId: project.id });
            successCallback?.();
          } catch (err: any) {
            toast.error(err.message);
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
        <Button type="submit" variant="outlined" disabled={url === ''}>
          Clone
        </Button>
      </StyledForm>
    </Modal>
  );
};
