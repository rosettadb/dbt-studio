import { Close as CloseIcon } from '@mui/icons-material';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Checkbox,
  TextField,
  IconButton,
  FormControlLabel,
  Box,
  DialogContentText,
  Divider,
  InputAdornment,
} from '@mui/material';
import React from 'react';
import { projectsServices } from '../../../services';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  processCallback: (path: string) => void;
  path: string;
};

export const StagingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  processCallback,
  path,
}) => {
  const [updatedPath, setUpdatedPath] = React.useState(path || '');
  const [selectAll, setSelectAll] = React.useState(false);
  const handleSelectAllChange = () => {
    setSelectAll(!selectAll);
  };
  return (
    <Dialog open={isOpen} onClose={onClose} title="Staging Layer">
      <DialogTitle>Rosetta DBT Staging</DialogTitle>
      <IconButton
        aria-label="close"
        onClick={onClose}
        sx={(theme) => ({
          position: 'absolute',
          right: 8,
          top: 8,
          color: theme.palette.grey[500],
        })}
      >
        <CloseIcon />
      </IconButton>
      <DialogContent>
        <DialogContentText>Please select input files</DialogContentText>
        <Box
          noValidate
          component="form"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            m: 'auto',
            width: 500,
            gap: 2,
          }}
        >
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Checkbox
                name="selectAll"
                checked={selectAll}
                onChange={handleSelectAllChange}
              />
            }
            label="Select All"
          />
          <Divider />
          <DialogContentText>Please select output path</DialogContentText>
          <TextField
            label="Output path"
            variant="outlined" // or "filled", "standard"
            value={updatedPath}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end" sx={{ p: 0 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    onClick={async () => {
                      const result = await projectsServices.chooseDir({
                        path: updatedPath,
                      });
                      if (result !== 'false') {
                        setUpdatedPath(result);
                      }
                    }}
                  >
                    Browse
                  </Button>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => processCallback(updatedPath)}>
          Rosetta DBT Staging
        </Button>
      </DialogActions>
    </Dialog>
  );
};
