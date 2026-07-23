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
  lastSuccessfulRefreshAt?: string;
  busy: boolean;
  activeOperationId?: string;
  layoutVersion: 'okf-v0.1' | 'empty';
  okfVersion?: '0.1';
};

export type SecondBrainTreeItem = SecondBrainPageSummary & {
  archived: boolean;
  generated?: boolean;
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
  status: 'completed' | 'partial' | 'no-change' | 'cancelled';
  dryRun: boolean;
  modelCalled: boolean;
  itemsCollected: number;
  operationsProposed: number;
  operationsSkipped: number;
  operationsApplied: number;
  operationsFailed: number;
  failures: Array<{ pageId: string; code: string }>;
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

export type WikiMemorySourceHealth = {
  sourceKind:
    | 'sessions'
    | 'analytics'
    | 'projects'
    | 'application'
    | 'notebooks'
    | 'git'
    | 'wiki';
  lastAttemptedAt: string;
  lastSuccessfulAt?: string;
  itemCount: number;
  characterCount: number;
  aggregateHash: string;
  changed: boolean;
  truncated: boolean;
  result: 'unchanged' | 'completed' | 'partial' | 'failed' | 'cancelled';
  safeErrorCode?: string;
  derivedPageIds: string[];
  operationsApplied: number;
};

export type WikiMemorySupportStatus = {
  sources: WikiMemorySourceHealth[];
  diagnosticEventCount: number;
  diagnosticBytes: number;
  retentionDays: number;
  maxLogFiles: number;
  maxLogBytes: number;
};

export type WikiMemorySupportExportPreview = {
  sourceCount: number;
  diagnosticEventCount: number;
  diagnosticBytes: number;
};
