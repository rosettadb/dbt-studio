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
  | 'SYMLINK_NOT_ALLOWED';

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
  version: 1;
  initializedAt: string;
  lastSuccessfulRefreshAt?: string;
  sourceCursors: Record<string, unknown>;
  sourceHashes: Record<string, string>;
  pageHashes: Record<string, string>;
  lastRefresh?: { status: string; error?: string };
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
};

export type {
  SecondBrainActor,
  SecondBrainPage,
  SecondBrainPageSummary,
  SecondBrainRevisionSummary,
  SecondBrainStatus,
};
