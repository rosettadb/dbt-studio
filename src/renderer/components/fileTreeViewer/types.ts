export type FileNode = {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
};

export type GitStatus =
  | 'modified'
  | 'untracked'
  | 'staged'
  | 'deleted'
  | 'renamed'
  | 'conflicted';

export type FileStatuses = Record<string, GitStatus>;

export interface TreeContextMenuState {
  mouseX: number;
  mouseY: number;
  node: FileNode;
}

export interface CopiedNode {
  path: string;
  type: 'file' | 'folder';
  name: string;
}
