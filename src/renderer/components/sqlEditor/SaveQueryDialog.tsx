import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { FolderOutlined, Storage as StorageIcon } from '@mui/icons-material';
import {
  PROJECT_QUERIES_DIR,
  type SaveLocation,
} from '../../../shared/projectFolders';

interface SaveQueryDialogProps {
  open: boolean;
  /** Dialog heading. */
  title?: string;
  initialName?: string;
  /**
   * The project linked to the connection: when set, the dialog asks whether
   * to save in its queries/ folder (the default) or in Studio.
   */
  projectName?: string;
  onClose: () => void;
  onSave: (name: string, location: SaveLocation) => Promise<void>;
}

export const SaveQueryDialog: React.FC<SaveQueryDialogProps> = ({
  open,
  title = 'Saved Query Name',
  initialName = 'Query #1',
  projectName,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [location, setLocation] = useState<SaveLocation>('project');

  useEffect(() => {
    if (open) {
      setName(initialName);
      setIsSaving(false);
      setLocation(projectName ? 'project' : 'studio');
    }
  }, [open, initialName, projectName]);

  const handleSave = async () => {
    if (name.trim() && !isSaving) {
      setIsSaving(true);
      try {
        await onSave(name.trim(), projectName ? location : 'studio');
        onClose();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to save query:', error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '0.9rem', fontWeight: 600, pb: 1 }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          {projectName && (
            <RadioGroup
              value={location}
              onChange={(e) => setLocation(e.target.value as SaveLocation)}
              sx={{ mt: 1.5 }}
            >
              <FormControlLabel
                value="project"
                control={<Radio size="small" />}
                label={
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                  >
                    <FolderOutlined sx={{ fontSize: 16 }} />
                    <Typography sx={{ fontSize: 13 }}>
                      {projectName}/{PROJECT_QUERIES_DIR}/ (a .sql file in the
                      project)
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="studio"
                control={<Radio size="small" />}
                label={
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                  >
                    <StorageIcon sx={{ fontSize: 16 }} />
                    <Typography sx={{ fontSize: 13 }}>
                      Local (only in Studio, not in Git)
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onClose}
          color="inherit"
          size="small"
          variant="contained"
          sx={{
            bgcolor: 'action.hover',
            color: 'text.primary',
            boxShadow: 'none',
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          color="primary"
          size="small"
          variant="contained"
          disabled={!name.trim() || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
