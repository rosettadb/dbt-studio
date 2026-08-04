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
  processCallback: (path: string) => Promise<void>;
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
  const [loading, setLoading] = React.useState(false);

  const updateProject = useUpdateProject();

  React.useEffect(() => {
    return () => setLoading(false);
  }, []);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Raw Layer"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            minWidth: '60vw',
            borderRadius: 2,
            boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.12)',
          },
        },
      }}
    >
      <DialogTitle>Generate Raw Layer</DialogTitle>
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
            width: '100%',
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
      <DialogActions
        sx={{
          px: 3,
          pb: 3,
          pt: 2,
          gap: 2,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Button
          onClick={onClose}
          color="inherit"
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            px: 3,
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={async () => {
            setLoading(true);
            try {
              await updateProject.mutateAsync({
                ...project,
                rawLayerDir: updatedPath,
              });
              await processCallback(updatedPath);
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            px: 3,
          }}
        >
          Generate Raw Layer
        </Button>
      </DialogActions>
    </Dialog>
  );
};
