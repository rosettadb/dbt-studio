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
import { useUpdateProject } from '../../../controllers';
import { Project } from '../../../../types/backend';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  processCallback: (path: string, inputPath: string) => void;
  path: string;
  project: Project;
};

export const IncrementalModal: React.FC<Props> = ({
  isOpen,
  onClose,
  processCallback,
  path,
  project,
}) => {
  const [updatedPath, setUpdatedPath] = React.useState<string>(path);
  const [selectAll, setSelectAll] = React.useState(false);
  const handleSelectAllChange = () => {
    setSelectAll(!selectAll);
  };
  const updateProject = useUpdateProject();

  return (
    <Dialog open={isOpen} onClose={onClose} title="Incremental Layer">
      <DialogTitle>Rosetta DBT Incremental</DialogTitle>
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
        <DialogContentText>{`Please select input files from ${project.stagingDir}`}</DialogContentText>
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
                        await updateProject.mutateAsync({
                          ...project,
                          incrementalDir: result,
                        });
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
        <Button
          onClick={() => processCallback(updatedPath, project.stagingDir ?? '')}
        >
          Rosetta DBT Incremental
        </Button>
      </DialogActions>
    </Dialog>
  );
};
