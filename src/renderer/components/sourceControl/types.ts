// Source Control component types
export interface GitFileAction {
  type: 'stage' | 'unstage' | 'discard' | 'diff' | 'open' | 'reveal';
  filePath: string;
}

export interface GitBulkAction {
  type: 'stageAll' | 'unstageAll';
}

export type GitAction = GitFileAction | GitBulkAction;
