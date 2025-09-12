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

const HIDDEN_FOLDERS = ['.git'];

const FolderTreeItem: React.FC<ItemProps> = ({ label }) => {
  return (
    <StyledTreeItem>
      <Folder
        sx={{
          color: HIDDEN_FOLDERS.indexOf(label) === -1 ? '#5f89f4' : '#aabdefff',
          width: 14,
          height: 14,
        }}
      />
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
        <OverflowTip style={{ color, minWidth: 180 }}>{label}</OverflowTip>
      </StyledLabel>
    </StyledTreeItem>
  );
};

const RootTreeItem: React.FC<ItemProps> = ({ label, color }) => {
  return (
    <StyledTreeItem>
      <StyledLabel
        variant="caption"
        style={{ paddingTop: 0, paddingBottom: 0 }}
      >
        <OverflowTip style={{ color, fontWeight: 600 }}>{label}</OverflowTip>
      </StyledLabel>
    </StyledTreeItem>
  );
};

export const TreeItems = {
  Root: RootTreeItem,
  Folder: FolderTreeItem,
  File: FileTreeItem,
};
