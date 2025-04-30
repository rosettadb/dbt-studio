import React from 'react';
import { Folder } from '@mui/icons-material';
import { StyledLabel, StyledTreeItem } from './styles';
import { FileIcon } from '../fileIcon';
import { OverflowTip } from '../overflowTip';

type ItemProps = {
  label: string;
  // eslint-disable-next-line react/no-unused-prop-types
  color?: string;
};

const FolderTreeItem: React.FC<ItemProps> = ({ label }) => {
  return (
    <StyledTreeItem>
      <Folder sx={{ color: '#5f89f4', width: 18, height: 18 }} />
      <StyledLabel variant="caption">
        <OverflowTip>{label}</OverflowTip>
      </StyledLabel>
    </StyledTreeItem>
  );
};

const FileTreeItem: React.FC<ItemProps> = ({ label, color }) => {
  return (
    <StyledTreeItem>
      <FileIcon fileName={label} />
      <StyledLabel variant="caption">
        <OverflowTip style={{ color }}>{label}</OverflowTip>
      </StyledLabel>
    </StyledTreeItem>
  );
};

export const TreeItems = {
  Folder: FolderTreeItem,
  File: FileTreeItem,
};
