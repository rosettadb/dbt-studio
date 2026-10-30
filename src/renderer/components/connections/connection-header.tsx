import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Typography,
} from '@mui/material';
import { Save, Close } from '@mui/icons-material';

interface Props {
  title: string;
  imageSource: string;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  isLoading?: boolean;
}

const ConnectionHeader = ({
  title,
  imageSource,
  onClose,
  onSave,
  isLoading,
}: Props) => {
  // Rendered as siblings (no wrapper) so the sticky action bar stays pinned
  // for the whole height of the form, not just inside this header.
  return (
    <>
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          bgcolor: 'background.default',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          maxWidth: '800px',
          py: 1,
          mb: 1,
          gap: 2,
          flexWrap: 'wrap',
          // Fields scrolled into view (e.g. Shift+Tab) land below the bar, not behind it
          '& ~ * *': { scrollMarginTop: '80px' },
        }}
      >
        <Typography variant="h6" component="h5">
          Setup connection
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Close />}
            onClick={onClose}
            size="small"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={
              isLoading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <Save />
              )
            }
            onClick={(e) => onSave(e as React.FormEvent)}
            size="small"
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          width: '100%',
          maxWidth: '800px', // Changed from 800px to 500px
          mb: 3,
        }}
      >
        <Divider sx={{ mb: 2 }} />

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <img
            src={imageSource}
            alt={title}
            style={{
              width: '150px',
              height: '50px',
              objectFit: 'contain',
            }}
          />
          {/*
          <TextField
            label="Project"
            name="project"
            value={title}
            onChange={(e) => console.log(e.target.value)}
            fullWidth
            size="small"
          />
          */}
        </Box>
      </Box>
    </>
  );
};

export default ConnectionHeader;
