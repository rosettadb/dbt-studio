import React from 'react';
import { Box, Typography } from '@mui/material';
import { Modal } from '../modals/modal';
import { LineageView } from './LineageView';

type LineageModalProps = {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  modelId?: string;
  filePath?: string;
};

export const LineageModal: React.FC<LineageModalProps> = ({
  isOpen,
  onClose,
  projectId,
  modelId,
  filePath,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Model Lineage"
      hideHeader
      fullScreen
      maxWidth="xl"
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ px: 3, pt: 3 }}>
          <Typography variant="h6">Model Lineage</Typography>
          <Typography variant="body2" color="text.secondary">
            Explore upstream and downstream relationships for your dbt model.
          </Typography>
        </Box>

        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <LineageView
            projectId={projectId}
            modelId={modelId}
            filePath={filePath}
          />
        </Box>
      </Box>
    </Modal>
  );
};
