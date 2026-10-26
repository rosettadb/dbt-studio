import type { SupportedConnectionTypes } from '../registry.shared';

/** Moved verbatim from src/types/backend.ts (lines 20-27 on bc5dabff). */
export type ConnectionBase = {
  type: SupportedConnectionTypes;
  name: string;
  username: string;
  password: string;
  database: string;
  schema: string;
};

/** Moved verbatim from src/types/backend.ts (lines 193-199 on bc5dabff). */
export type DBTConnectionBase = {
  type: SupportedConnectionTypes;
  username: string;
  password: string;
  database: string;
  schema: string;
};
