import React from 'react';
import { Box, Modal, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { previewChatImage } from '../../services/agent.service';

interface ImageLightboxProps {
  /** Attachment ID passed to agent:images:preview */
  id: string;
  conversationId: number;
  /** Alt text (filename) */
  name: string;
  open: boolean;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  id,
  conversationId,
  name,
  open,
  onClose,
}) => {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setDataUrl(null);
    const load = async () => {
      try {
        const res = await previewChatImage(id, conversationId);
        if (!cancelled) setDataUrl(res.dataUrl);
      } catch {
        // silently ignore — image just won't show
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, id, conversationId]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      slotProps={{
        backdrop: {
          sx: { backgroundColor: 'rgba(0,0,0,0.85)' },
        },
      }}
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Wrapper intercepts clicks on the backdrop area to close */}
      <Box
        onClick={onClose}
        sx={{
          position: 'relative',
          maxWidth: '90vw',
          maxHeight: '90vh',
          outline: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          size="small"
          aria-label="Close image preview"
          sx={{
            position: 'absolute',
            top: -36,
            right: 0,
            color: 'grey.300',
            '&:hover': { color: 'white' },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        {loading && <CircularProgress size={32} sx={{ color: 'grey.400' }} />}

        {dataUrl && !loading && (
          <Box
            component="img"
            src={dataUrl}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            sx={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 1,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              display: 'block',
              cursor: 'default',
            }}
          />
        )}
      </Box>
    </Modal>
  );
};
