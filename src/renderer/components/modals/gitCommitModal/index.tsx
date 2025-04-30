import React from 'react';
import {
  Button,
  TextField,
  Checkbox,
  FormControlLabel,
  Typography,
  Divider,
  Box,
} from '@mui/material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { ListContainer, StyledForm } from './styles';
import {
  useGetFileStatuses,
  useGetSelectedProject,
  useGitCommit,
} from '../../../controllers';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  successCallback?: () => void;
  path: string;
};

export const GitCommitModal: React.FC<Props> = ({
  isOpen,
  onClose,
  successCallback,
  path,
}) => {
  const { mutate: commit } = useGitCommit({
    onSuccess: () => {
      toast.info('Files committed!');
      onClose();
      successCallback?.();
    },
  });

  const { data: project } = useGetSelectedProject();
  const { data: statuses = [] } = useGetFileStatuses(path);
  const [message, setMessage] = React.useState('');
  const [selectedFiles, setSelectedFiles] = React.useState<string[]>([]);
  const [selectAll, setSelectAll] = React.useState(false);

  const staged = statuses.filter((s) => s.status !== 'untracked');
  const unstaged = statuses.filter((s) => s.status === 'untracked');

  const toggleFile = (filePath: string) => {
    setSelectedFiles((prev) =>
      prev.includes(filePath)
        ? prev.filter((f) => f !== filePath)
        : [...prev, filePath],
    );
  };

  const isFileSelected = (filePath: string) => selectedFiles.includes(filePath);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedFiles.length === 0 && !selectAll) {
      toast.warning('Please select at least one file to commit.');
      return;
    }

    commit({
      path,
      message,
      files: selectAll
        ? [...staged, ...unstaged].map((f) => f.path)
        : selectedFiles,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Commit Changes">
      <StyledForm onSubmit={handleSubmit}>
        <TextField
          variant="outlined"
          label="Commit Message"
          onChange={(event) => setMessage(event.target.value)}
          value={message}
          fullWidth
          sx={{ mb: 2 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={selectAll}
              disabled={statuses.length === 0}
              onChange={() => setSelectAll(!selectAll)}
            />
          }
          style={{
            fontSize: 12,
          }}
          label={<Typography sx={{ fontSize: 12 }}>Select All</Typography>}
        />
        <Typography variant="subtitle1">Staged Files</Typography>
        {staged.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No staged files.
          </Typography>
        )}
        <ListContainer>
          {staged.map((file) => (
            <FormControlLabel
              key={file.path}
              control={
                <Checkbox
                  checked={selectAll || isFileSelected(file.path)}
                  onChange={() => toggleFile(file.path)}
                />
              }
              label={
                <Typography sx={{ fontSize: 12 }}>
                  {file.path.replace(project?.path ?? '', '')}
                </Typography>
              }
            />
          ))}
        </ListContainer>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1">Unstaged Files</Typography>
        {unstaged.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No unstaged files.
          </Typography>
        )}
        <ListContainer>
          {unstaged.map((file) => (
            <FormControlLabel
              key={file.path}
              control={
                <Checkbox
                  checked={selectAll || isFileSelected(file.path)}
                  onChange={() => toggleFile(file.path)}
                />
              }
              style={{
                fontSize: 12,
              }}
              label={
                <Typography sx={{ fontSize: 12 }}>
                  {file.path.replace(project?.path ?? '', '')}
                </Typography>
              }
            />
          ))}
        </ListContainer>
        <Box mt={3}>
          <Button
            type="submit"
            variant="outlined"
            disabled={
              message.trim() === '' ||
              statuses.length === 0 ||
              (selectedFiles.length === 0 && !selectAll)
            }
          >
            Commit
          </Button>
        </Box>
      </StyledForm>
    </Modal>
  );
};
