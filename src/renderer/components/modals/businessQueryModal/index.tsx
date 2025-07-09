import React from 'react';
import { Button, TextField, Stack } from '@mui/material';
import { AutoAwesome } from '@mui/icons-material';
import { Modal } from '../modal';
import { StyledForm } from './styles';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (query: string) => void;
};

export const BusinessQueryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [query, setQuery] = React.useState('');
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enter prompt">
      <StyledForm
        onSubmit={async (event) => {
          event.preventDefault();
          onSubmit(query);
          onClose();
        }}
      >
        <Stack spacing={3} width="100%">
          <TextField
            variant="outlined"
            label="Prompt"
            placeholder="Write your prompt to generate a dbt business models."
            onChange={(event) => setQuery(event.target.value)}
            value={query}
            fullWidth
            multiline
            rows={5}
            InputProps={{
              style: {
                minHeight: '120px',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                height: 'auto',
              },
              '& .MuiInputBase-inputMultiline': {
                height: '150px !important',
                resize: 'none',
              },
            }}
          />
          <Button
            type="submit"
            variant="outlined"
            disabled={query === ''}
            sx={{ alignSelf: 'flex-end' }}
            endIcon={<AutoAwesome />}
          >
            Generate
          </Button>
        </Stack>
      </StyledForm>
    </Modal>
  );
};
