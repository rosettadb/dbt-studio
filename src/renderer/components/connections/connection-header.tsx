import React from 'react';
import { Box, Button, Divider, Typography } from '@mui/material';
import { Save, Close } from '@mui/icons-material';

interface Props {
  title: string;
  imageSource: string;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
}

const ConnectionHeader = ({ title, imageSource, onClose, onSave }: Props) => {
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '800px', // Changed from 800px to 500px
        mb: 3,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          mb: 2,
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
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Save />}
            onClick={(e) => onSave(e as React.FormEvent)}
            size="small"
          >
            Save
          </Button>
        </Box>
      </Box>

      <Divider sx={{ my: 2 }} />

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
  );
};

export default ConnectionHeader;
