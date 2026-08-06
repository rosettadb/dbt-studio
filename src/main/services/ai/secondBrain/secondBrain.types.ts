import type {
  SecondBrainActor,
  SecondBrainFrontmatter,
  SecondBrainPage,
  SecondBrainPageSummary,
  SecondBrainRevisionSummary,
  SecondBrainStatus,
} from '../../../../types/backend';

export type SecondBrainPageId = string;
export type SecondBrainContentHash = string;
export type SecondBrainWriteMode =
  | 'create'
  | 'replace-section'
  | 'append-section';

export type SecondBrainErrorCode =
  | 'NOT_INITIALIZED'
  | 'DISABLED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'CONFLICT'
  | 'OUTSIDE_ROOT'
  | 'INVALID_PAGE_ID'
  | 'INVALID_CONTENT'
  | 'INVALID_FRONTMATTER'
  | 'INVALID_STATE'
  | 'BUDGET_EXCEEDED'
  | 'SYMLINK_NOT_ALLOWED'
  | 'HARD_LINK_NOT_ALLOWED'
  | 'OUT_OF_SCOPE'
  | 'SCOPE_MISMATCH'
  | 'CANCELLED'
  | 'BUSY'
  | 'UNSUPPORTED_BUNDLE_VERSION'
  | 'GENERATED_PAGE_READ_ONLY';

export class SecondBrainError extends Error {
  public readonly code: SecondBrainErrorCode;

  public readonly details?: Record<string, unknown>;

  constructor(
    code: SecondBrainErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SecondBrainError';
    this.code = code;
    this.details = details;
  }
}

export type SecondBrainState = {
  version: 2;
  layoutVersion: 2;
  okfVersion: '0.2';
  initializedAt: string;
  lastSuccessfulRefreshAt?: string;
  sourceCursors: Record<string, unknown>;
  sourceHashes: Record<string, string>;
  pageHashes: Record<string, string>;
  lastRefresh?: {
    status: 'completed' | 'partial' | 'no-change' | 'failed' | 'cancelled';
    completedAt: string;
    sources: string[];
    itemsCollected: number;
    operationsApplied: number;
    truncated: boolean;
    error?: string;
  };
};

export type SecondBrainRefreshStateInput = {
  sources: Array<{
    sourceId: string;
    cursor: unknown;
    hash: string;
  }>;
  status: 'completed' | 'partial' | 'no-change';
  itemsCollected: number;
  operationsApplied: number;
  truncated: boolean;
};

export type ParsedSecondBrainDocument = {
  frontmatter: SecondBrainFrontmatter;
  body: string;
};

export type SecondBrainServiceOptions = {
  rootPath?: string;
  maxPageBytes?: number;
  maxTotalBytes?: number;
  revisionLimit?: number;
  now?: () => Date;
  createId?: () => string;
  openTerminal?: (workingDirectory: string) => Promise<void>;
};

export type {
  SecondBrainActor,
  SecondBrainPage,
  SecondBrainPageSummary,
  SecondBrainRevisionSummary,
  SecondBrainStatus,
};
