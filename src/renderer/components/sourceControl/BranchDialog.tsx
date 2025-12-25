import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Close, Add, Edit, Delete, SwapHoriz } from '@mui/icons-material';

interface Branch {
  name: string;
  checkedOut: boolean;
}

interface BranchDialogProps {
  open: boolean;
  action: 'create' | 'delete' | 'rename' | 'switch' | null;
  inputValue: string;
  onInputChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  branches?: Branch[];
}

export const BranchDialog: React.FC<BranchDialogProps> = ({
  open,
  action,
  inputValue,
  onInputChange,
  onConfirm,
  onCancel,
  isLoading,
  branches = [],
}) => {
  const getTitle = () => {
    switch (action) {
      case 'create':
        return 'Create New Branch';
      case 'delete':
        return 'Delete Branch';
      case 'rename':
        return 'Rename Branch';
      case 'switch':
        return 'Switch Branch';
      default:
        return '';
    }
  };

  const getLabel = () => {
    switch (action) {
      case 'create':
        return 'Branch name';
      case 'delete':
        return 'Select branch to delete';
      case 'rename':
        return 'New branch name';
      case 'switch':
        return 'Select branch';
      default:
        return '';
    }
  };

  const getButtonText = () => {
    if (isLoading) return 'Processing...';
    if (action === 'switch') return 'Switch';
    if (action === 'delete') return 'Delete';
    return 'Confirm';
  };

  const getActionIcon = () => {
    switch (action) {
      case 'create':
        return <Add />;
      case 'delete':
        return <Delete />;
      case 'rename':
        return <Edit />;
      case 'switch':
        return <SwapHoriz />;
      default:
        return null;
    }
  };

  const getContent = () => {
    switch (action) {
      case 'delete':
        return (
          <Box>
            <FormControl fullWidth margin="normal" sx={{ mb: 2 }}>
              <InputLabel id="delete-branch-label">{getLabel()}</InputLabel>
              <Select
                labelId="delete-branch-label"
                id="delete-branch-select"
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                label={getLabel()}
              >
                {branches
                  .filter((b) => !b.checkedOut)
                  .map((branch) => (
                    <MenuItem key={branch.name} value={branch.name}>
                      {branch.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            {inputValue && (
              <Box>
                <Typography color="error" variant="body2" sx={{ mb: 1 }}>
                  Are you sure you want to delete &quot;
                  {inputValue}
                  &quot;?
                </Typography>
                <Typography variant="caption">
                  This action cannot be undone.
                </Typography>
              </Box>
            )}
          </Box>
        );
      case 'switch':
        return (
          <FormControl fullWidth margin="normal">
            <InputLabel id="switch-branch-label">{getLabel()}</InputLabel>
            <Select
              labelId="switch-branch-label"
              id="switch-branch-select"
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              label={getLabel()}
            >
              {branches
                .filter((b) => !b.checkedOut)
                .map((branch) => (
                  <MenuItem key={branch.name} value={branch.name}>
                    {branch.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        );
      default:
        return (
          <TextField
            autoFocus
            label={getLabel()}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            fullWidth
            variant="outlined"
            margin="normal"
            helperText={action === 'create' ? 'e.g., feature/new-feature' : ''}
          />
        );
    }
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{getTitle()}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>{getContent()}</DialogContent>
      <DialogActions>
        <Button onClick={onCancel} variant="outlined" startIcon={<Close />}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={action === 'delete' ? 'error' : 'primary'}
          disabled={!inputValue || isLoading}
          startIcon={getActionIcon()}
        >
          {getButtonText()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
