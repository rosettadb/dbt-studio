import React from 'react';
import { Button, TextField } from '@mui/material';
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
    },
  });
  const [remote, setRemote] = React.useState('');
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add git remote">
      <StyledForm
        onSubmit={async (event) => {
          event.preventDefault();
          addRemote({
            path,
            url: remote,
          });
          successCallback?.();
        }}
      >
        <TextField
          variant="outlined"
          label="Remote Url"
          onChange={(event) => setRemote(event.target.value)}
          value={remote}
          fullWidth
        />
        <Button type="submit" variant="outlined" disabled={remote === ''}>
          Add
        </Button>
      </StyledForm>
    </Modal>
  );
};
