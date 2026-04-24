import React from 'react';
import {
  Box,
  Typography,
  Button,
  Collapse,
  Tooltip,
  Stack,
} from '@mui/material';
import {
  CheckCircleOutline,
  KeyboardArrowDown,
  KeyboardArrowRight,
} from '@mui/icons-material';
import { FileTypeBadge } from '../../utils/fileTypeIcon';

interface ChangedFile {
  path: string;
  added: number;
  removed: number;
}

interface FilesChangedBlockProps {
  files: ChangedFile[];
  onOpenFile: (path: string) => void;
  onDismiss: () => void;
  onDiscard?: () => void;
}

export const FilesChangedBlock: React.FC<FilesChangedBlockProps> = ({
  files,
  onOpenFile,
  onDismiss,
  onDiscard,
}) => {
  const [expanded, setExpanded] = React.useState(true);

  if (files.length === 0) return null;

  return (
    <Box
      sx={{
        mt: 0.5,
        mb: 0.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 0.5,
        overflow: 'hidden',
        minWidth: 0,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          px: 1,
          py: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          bgcolor: 'action.hover',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', color: 'success.main' }}
        >
          <CheckCircleOutline fontSize="small" />
        </Box>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, flexGrow: 1, fontSize: '12px' }}
        >
          {files.length} File{files.length === 1 ? '' : 's'} With Changes
        </Typography>

        <Stack direction="row" spacing={0.5} alignItems="center">
          {onDiscard && (
            <Button
              size="small"
              variant="outlined"
              color="error"
              sx={{ fontSize: '11px', py: 0, minWidth: 'unset', px: 0.75 }}
              onClick={(e) => {
                e.stopPropagation();
                onDiscard();
              }}
            >
              Discard
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            color="primary"
            sx={{ fontSize: '11px', py: 0, minWidth: 'unset', px: 0.75 }}
            onClick={(e) => {
              e.stopPropagation();
              files.forEach((f) => onOpenFile(f.path));
              onDismiss();
            }}
          >
            Keep
          </Button>
          {expanded ? (
            <KeyboardArrowDown fontSize="small" />
          ) : (
            <KeyboardArrowRight fontSize="small" />
          )}
        </Stack>
      </Box>

      <Collapse in={expanded}>
        <Box
          sx={{ p: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}
        >
          {files.map((file) => (
            <Box
              key={file.path}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 0.5,
                py: 0.25,
                borderRadius: 0.5,
                minWidth: 0,
                '&:hover': { bgcolor: 'action.hover' },
                cursor: 'pointer',
              }}
              onClick={() => onOpenFile(file.path)}
            >
              <FileTypeBadge filename={file.path.split('/').pop() || ''} />
              <Tooltip title={file.path} placement="top" enterDelay={500}>
                <Typography
                  variant="caption"
                  sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'text.primary',
                    fontSize: '12px',
                  }}
                >
                  {file.path.split('/').pop()}
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ color: 'text.disabled', ml: 0.25, fontSize: '11px' }}
                  >
                    {(() => {
                      const parts = file.path.split('/');
                      return parts.length > 2
                        ? `…/${parts.slice(-2, -1)[0]}/`
                        : '';
                    })()}
                  </Typography>
                </Typography>
              </Tooltip>
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.25,
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                {file.added > 0 && (
                  <Box sx={{ color: 'success.main' }}>+{file.added}</Box>
                )}
                {file.removed > 0 && (
                  <Box sx={{ color: 'error.main' }}>-{file.removed}</Box>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};
