export const SECOND_BRAIN_DIRECTORY = 'second-brain';
export const SECOND_BRAIN_WIKI_DIRECTORY = 'wiki';
export const SECOND_BRAIN_STATE_FILE = 'state.json';
export const SECOND_BRAIN_REVISIONS_DIRECTORY = 'revisions';
export const SECOND_BRAIN_ARCHIVE_DIRECTORY = 'archive';
export const SECOND_BRAIN_SOURCES_DIRECTORY = 'sources';
export const SECOND_BRAIN_LOGS_DIRECTORY = 'logs';
export const SECOND_BRAIN_ENTRY_PAGE = 'memory.md';
export const SECOND_BRAIN_INDEX_PAGE = 'index.md';
export const SECOND_BRAIN_LOG_PAGE = 'log.md';
export const SECOND_BRAIN_OKF_VERSION = '0.1';
export const SECOND_BRAIN_LAYOUT_VERSION = 2;

export const SECOND_BRAIN_CANONICAL_DIRECTORIES = [
  'topics',
  'projects',
  'connections',
  'notebooks',
  'analytics',
] as const;

export const SECOND_BRAIN_SUPPORT_DIRECTORIES = [
  SECOND_BRAIN_REVISIONS_DIRECTORY,
  SECOND_BRAIN_ARCHIVE_DIRECTORY,
  SECOND_BRAIN_SOURCES_DIRECTORY,
  SECOND_BRAIN_LOGS_DIRECTORY,
] as const;

export const SECOND_BRAIN_BOOTSTRAP_PAGES: Record<string, string> = {
  'memory.md': `---
type: Memory Map
id: memory
title: Wiki Memory
description: Compact navigation map for durable dbt Studio memory.
scope: global
updated_by: user
sources: []
---

# Wiki Memory

This is the compact navigation map for durable memory.

## Core pages

- [[preferences]] — durable user preferences
- [[workflows]] — reusable successful workflows

## Scoped knowledge

- Project knowledge lives under \`projects/\`.
- Connection knowledge lives under \`connections/\`.
- Notebook knowledge lives under \`notebooks/\`.
- Analytics knowledge lives under \`analytics/\`.
`,
  'preferences.md': `---
type: User Preferences
id: preferences
title: Preferences
description: Durable user preferences that apply across sessions.
scope: global
updated_by: user
sources: []
---

# Preferences

Durable user preferences belong here.
`,
  'workflows.md': `---
type: Workflow Catalog
id: workflows
title: Workflows
description: Reusable and verified workflows.
scope: global
updated_by: user
sources: []
---

# Workflows

Reusable, verified workflows belong here.
`,
};

export const SECOND_BRAIN_DEFAULT_MAX_PAGE_BYTES = 64 * 1024;
export const SECOND_BRAIN_DEFAULT_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const SECOND_BRAIN_ENTRY_MAX_BYTES = 12 * 1024;
export const SECOND_BRAIN_ENTRY_MAX_LINES = 200;
export const SECOND_BRAIN_DEFAULT_REVISION_LIMIT = 5;
