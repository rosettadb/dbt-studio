import type {
  SecondBrainFrontmatter,
  SecondBrainPage,
  SecondBrainPageSummary,
  SecondBrainRevisionSummary,
} from './backend';

export type SecondBrainManagerStatus = {
  enabled: boolean;
  initialized: boolean;
  pageCount: number;
  totalBytes: number;
  rootDisplayName: string;
  lastSuccessfulRefreshAt?: string;
  busy: boolean;
  activeOperationId?: string;
};

export type SecondBrainTreeItem = SecondBrainPageSummary & {
  archived: boolean;
};

export type SecondBrainManagedPage = SecondBrainPage & {
  archived: boolean;
  readOnly: boolean;
};

export type SecondBrainSearchHit = {
  pageId: string;
  title: string;
  excerpt: string;
  hash: string;
  modifiedAt: string;
};

export type SecondBrainRevision = SecondBrainRevisionSummary & {
  content?: string;
};

export type SecondBrainWriteRequest = {
  pageId: string;
  content: string;
  expectedHash?: string;
};

export type SecondBrainArchiveRequest = {
  pageId: string;
  expectedHash: string;
};

export type SecondBrainRestoreRequest =
  | {
      kind: 'revision';
      pageId: string;
      revisionId: string;
      expectedHash: string;
    }
  | {
      kind: 'archive';
      pageId: string;
      expectedHash: string;
    };

export type SecondBrainRefreshStage =
  | 'preparing'
  | 'collecting'
  | 'redacting'
  | 'comparing'
  | 'generating'
  | 'validating'
  | 'applying'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type SecondBrainProgressEvent = {
  operationId: string;
  stage: SecondBrainRefreshStage;
  sourceId?: string;
  completed: number;
  total?: number;
  message: string;
  timestamp: string;
  cancellable: boolean;
};

export type SecondBrainRefreshResult = {
  status: 'completed' | 'no-change' | 'cancelled';
  dryRun: boolean;
  modelCalled: boolean;
  itemsCollected: number;
  operationsProposed: number;
  operationsApplied: number;
  changedPageIds: string[];
  truncated: boolean;
};

export type SecondBrainOperationResponse = {
  operationId: string;
  result: SecondBrainRefreshResult;
};

export type SecondBrainRevisionContent = {
  revisionId: string;
  pageId: string;
  content: string;
  frontmatter: SecondBrainFrontmatter;
};
