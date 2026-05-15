import React from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { EditorTabState } from '../../../../types/editor';
import { FileIcon } from '../../fileIcon';
import { ModifiedDot, TabButton, TabIconSlot, TabTitle } from './styles';

interface EditorTabProps {
  tab: EditorTabState;
  isActive: boolean;
  isLast?: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export const EditorTab: React.FC<EditorTabProps> = ({
  tab,
  isActive,
  isLast,
  onSelect,
  onClose,
}) => {
  const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClose();
  };

  return (
    <Tooltip
      title={tab.path}
      arrow
      placement="bottom"
      enterDelay={600}
      enterNextDelay={600}
    >
      <TabButton active={isActive} isLast={isLast} onClick={onSelect}>
        <TabIconSlot>
          <FileIcon fileName={tab.title} />
        </TabIconSlot>
        <TabTitle>{tab.title}</TabTitle>
        {!tab.isLoading && tab.error && (
          <Tooltip
            title={tab.error}
            arrow
            placement="bottom"
            enterDelay={300}
            enterNextDelay={300}
          >
            <ErrorOutlineIcon color="error" fontSize="small" />
          </Tooltip>
        )}
        <ModifiedDot hidden={!tab.isModified} />
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{
            ml: 0.25,
            width: 20,
            height: 20,
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
          }}
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      </TabButton>
    </Tooltip>
  );
};
