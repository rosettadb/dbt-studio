import React from 'react';
import { Button, TextField } from '@mui/material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { StyledForm } from './styles';
import { useGitCheckout } from '../../../controllers';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  successCallback?: () => void;
  path: string;
};

export const NewBranchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  successCallback,
  path,
}) => {
  const [branchName, setBranchName] = React.useState('');
  const { mutate: checkout } = useGitCheckout({
    onSuccess: () => {
      toast.success(`Checked out to new branch ${branchName}!`);
      window.location.reload();
      onClose();
    },
  });
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Git Checkout">
      <StyledForm
        onSubmit={async (event) => {
          event.preventDefault();
          checkout({ path, branch: branchName });
          successCallback?.();
        }}
      >
        <TextField
          variant="outlined"
          label="Branch Name"
          onChange={(event) => setBranchName(event.target.value)}
          value={branchName}
          fullWidth
        />
        <Button type="submit" variant="outlined" disabled={branchName === ''}>
          Create
        </Button>
      </StyledForm>
    </Modal>
  );
};
