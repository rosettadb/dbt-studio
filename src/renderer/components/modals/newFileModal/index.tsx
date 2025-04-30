import React from 'react';
import { Button, TextField } from '@mui/material';
import { Modal } from '../modal';
import { projectsServices } from '../../../services';
import { StyledForm } from './styles';
import { utils } from '../../../helpers';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  successCallback?: () => void;
  type: 'file' | 'folder';
  path: string;
};

export const NewFileModal: React.FC<Props> = ({
  isOpen,
  onClose,
  successCallback,
  type,
  path,
}) => {
  const [fileName, setFileName] = React.useState('');
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Create new ${type}`}>
      <StyledForm
        onSubmit={async (event) => {
          event.preventDefault();
          if (type === 'folder') {
            await projectsServices.createFolder({
              filePath: path,
              name: fileName,
            });
            successCallback?.();
            return;
          }
          await projectsServices.createFile({ filePath: path, name: fileName });
          successCallback?.();
        }}
      >
        <TextField
          variant="outlined"
          label={`${utils.capitalizeFirstLetter(type)} name`}
          onChange={(event) => setFileName(event.target.value)}
          value={fileName}
          fullWidth
        />
        <Button type="submit" variant="outlined" disabled={fileName === ''}>
          Save
        </Button>
      </StyledForm>
    </Modal>
  );
};
