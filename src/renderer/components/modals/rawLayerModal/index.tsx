import { Close as CloseIcon } from '@mui/icons-material';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  IconButton,
  Box,
  DialogContentText,
  InputAdornment,
} from '@mui/material';
import React from 'react';
import { projectsServices } from '../../../services';
import { useUpdateProject } from '../../../controllers';
import { Project } from '../../../../types/backend';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  processCallback: (path: string) => void;
  path: string;
  project: Project;
};

export const RawLayerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  processCallback,
  path,
  project,
}) => {
  const [updatedPath, setUpdatedPath] = React.useState<string>(path);
  const updateProject = useUpdateProject();

  return (
    <Dialog open={isOpen} onClose={onClose} title="Raw Layer">
      <DialogTitle>Rosetta DBT RawLayer</DialogTitle>
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
          <DialogContentText>Please select output path</DialogContentText>
          <TextField
            label="Output path"
            variant="outlined"
            onChange={(event) => setUpdatedPath(event.target.value)}
            value={updatedPath}
            slotProps={{
              input: {
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
                          await updateProject.mutateAsync({
                            ...project,
                            rawLayerDir: result,
                          });
                          setUpdatedPath(result);
                        }
                      }}
                    >
                      Browse
                    </Button>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => processCallback(updatedPath)}>
          Rosetta DBT RawLayer
        </Button>
      </DialogActions>
    </Dialog>
  );
};
