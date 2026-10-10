import { collectRecentRuns } from '../../../src/renderer/hooks/useRecentDbtRuns';

const entry = (id: string, startedAt: string) => ({
  id,
  projectName: 'p',
  projectPath: '/p',
  command: 'run',
  fullCommand: 'dbt run',
  status: 'success',
  startedAt,
  summary: { total: 0, success: 0, error: 0, warn: 0, skipped: 0 },
});

describe('collectRecentRuns', () => {
  it('merges projects, ignores corrupt keys and sorts newest first', () => {
    const store: Record<string, string> = {
      'dbt-studio:run-history:a': JSON.stringify([
        entry('a1', '2026-01-01T10:00:00Z'),
        entry('a2', '2026-01-03T10:00:00Z'),
      ]),
      'dbt-studio:run-history:b': JSON.stringify([
        entry('b1', '2026-01-02T10:00:00Z'),
      ]),
      'dbt-studio:run-history:c': '{not json',
    };
    const runs = collectRecentRuns(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      10,
      (k) => store[k] ?? null,
    );
    expect(runs.map((r) => r.id)).toEqual(['a2', 'b1', 'a1']);
  });

  it('respects the limit', () => {
    const store = {
      'dbt-studio:run-history:a': JSON.stringify([
        entry('1', '2026-01-01T00:00:00Z'),
        entry('2', '2026-01-02T00:00:00Z'),
      ]),
    } as Record<string, string>;
    expect(
      collectRecentRuns([{ id: 'a' }], 1, (k) => store[k] ?? null),
    ).toHaveLength(1);
  });
});
