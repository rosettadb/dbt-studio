export interface GitBranch {
  name: string;
  checkedOut: boolean;
  isLocal: boolean;
  isRemote: boolean;
  remoteName?: string;
}

export interface GitRemote {
  name: string;
  refs: {
    fetch: string;
    push: string;
  };
}

export interface RepositoryStatus {
  ahead: number;
  behind: number;
  hasChanges: boolean;
  hasStaged: boolean;
}

export interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'conflicted';
  staged: boolean;
}