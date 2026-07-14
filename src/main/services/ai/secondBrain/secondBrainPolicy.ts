export const SECOND_BRAIN_DIRECTORY = 'second-brain';
export const SECOND_BRAIN_STATE_FILE = '.state.json';
export const SECOND_BRAIN_META_DIRECTORY = '.meta';
export const SECOND_BRAIN_ARCHIVE_DIRECTORY = 'archive';
export const SECOND_BRAIN_ENTRY_PAGE = 'memory.md';

export const SECOND_BRAIN_CANONICAL_DIRECTORIES = [
  'topics',
  'projects',
  'connections',
  'notebooks',
  'analytics',
  SECOND_BRAIN_ARCHIVE_DIRECTORY,
] as const;

export const SECOND_BRAIN_BOOTSTRAP_PAGES: Record<string, string> = {
  'memory.md': `---
id: memory
title: Second Brain
scope: global
updated_by: user
sources: []
---

# Second Brain

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
id: preferences
title: Preferences
scope: global
updated_by: user
sources: []
---

# Preferences

Durable user preferences belong here.
`,
  'workflows.md': `---
id: workflows
title: Workflows
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
