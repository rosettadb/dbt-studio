import { writeMemoryFile, searchMemory } from './memoryService';

export const CONSOLIDATION_PROMPT = `You are an AI memory curator for a dbt Studio assistant.
Analyze the conversation below and extract any information worth remembering.

Return ONLY a structured output with these sections (omit empty sections):

## Rules
One per line, prefixed with "- ". Rules are things that caused errors and should be avoided, or constraints discovered.
Example: - DuckDB cannot JOIN tables across different attached databases

## Preferences
One per line, prefixed with "- ". User preferences about style, naming, or behavior.
Example: - User prefers snake_case column names

## Workflows
One per line, prefixed with "- ". Multi-step processes that worked and could be reused.
Example: - To copy a table: (1) CREATE TABLE AS SELECT, (2) verify row count, (3) grant permissions

## Concepts
One per line, prefixed with "- ". Business logic that explains WHY something works this way.
Example: - Incremental models use is_incremental() to filter new data

If nothing worth saving was discovered, return only: ## No new knowledge`;

export interface Extraction {
  rules: string[];
  preferences: string[];
  workflows: string[];
  concepts: string[];
}

export function parseExtraction(text: string): Extraction {
  const result: Extraction = {
    rules: [],
    preferences: [],
    workflows: [],
    concepts: [],
  };

  const currentSection: { key: keyof Extraction; lines: string[] }[] = [
    { key: 'rules', lines: [] },
    { key: 'preferences', lines: [] },
    { key: 'workflows', lines: [] },
    { key: 'concepts', lines: [] },
  ];

  let activeIdx = -1;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      const header = headerMatch[1].toLowerCase();
      const idx = currentSection.findIndex(
        (s) =>
          s.key === header ||
          (s.key === 'preferences' && header === 'preference'),
      );
      activeIdx = idx >= 0 ? idx : -1;
    } else if (activeIdx >= 0 && line.startsWith('- ')) {
      currentSection[activeIdx].lines.push(line.slice(2).trim());
    }
  }

  currentSection.forEach((s) => {
    if (s.lines.length > 0) {
      result[s.key] = s.lines;
    }
  });

  return result;
}

export async function deduplicateAgainstMemory(
  extraction: Extraction,
): Promise<Extraction> {
  const deduped: Extraction = {
    rules: [],
    preferences: [],
    workflows: [],
    concepts: [],
  };

  const checks: Array<{ key: keyof Extraction; items: string[] }> = [
    { key: 'rules', items: extraction.rules },
    { key: 'preferences', items: extraction.preferences },
    { key: 'workflows', items: extraction.workflows },
    { key: 'concepts', items: extraction.concepts },
  ];

  const results = await Promise.all(
    checks.map(async ({ key, items }) => {
      if (items.length === 0) return { key, items: [] as string[] };
      const searchResults = await Promise.all(
        items.map(async (item) => {
          const words = item.split(/\s+/).slice(0, 5).join(' ');
          const matches = await searchMemory(words);
          return { item, isDuplicate: matches.length > 0 };
        }),
      );
      return {
        key,
        items: searchResults.filter((r) => !r.isDuplicate).map((r) => r.item),
      };
    }),
  );

  results.forEach(({ key, items }) => {
    deduped[key] = items;
  });

  return deduped;
}

function labelForSection(key: string): string {
  switch (key) {
    case 'rules':
      return 'Rules';
    case 'preferences':
      return 'Preferences';
    case 'workflows':
      return 'Workflows';
    default:
      return 'Concepts';
  }
}

function formatForFile(key: string, items: string[]): string {
  const date = new Date().toISOString().split('T')[0];
  const header = `## ${labelForSection(key)} (auto-discovered ${date})`;
  return `${header}\n${items.map((i) => `- ${i}`).join('\n')}\n`;
}

export async function writeToMemory(extraction: Extraction): Promise<void> {
  const writes: Array<{ path: string; key: string; items: string[] }> = [
    { path: '01000_rules-learned.md', key: 'rules', items: extraction.rules },
    {
      path: '01000_rules-learned.md',
      key: 'preferences',
      items: extraction.preferences,
    },
    {
      path: '02000_skills-learned.md',
      key: 'workflows',
      items: extraction.workflows,
    },
    {
      path: '03000_proprietary-knowledge.md',
      key: 'concepts',
      items: extraction.concepts,
    },
  ];

  await Promise.all(
    writes.map(async ({ path, key, items }) => {
      if (items.length === 0) return;
      const content = formatForFile(key, items);
      await writeMemoryFile(path, content, 'append');
    }),
  );
}
