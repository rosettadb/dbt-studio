import { buildTerminalAiPrompt } from '../../../../src/renderer/components/terminal/aiAssist';

describe('buildTerminalAiPrompt', () => {
  it('uses selected text when the user selected terminal output', () => {
    const prompt = buildTerminalAiPrompt(
      'Database Error',
      ['successful setup'],
      ['different error'],
    );

    expect(prompt).toContain('Database Error');
    expect(prompt).not.toContain('successful setup');
    expect(prompt).not.toContain('different error');
  });

  it('uses all output when there is no selection', () => {
    const prompt = buildTerminalAiPrompt('', ['dbt run'], ['Database Error']);

    expect(prompt).toContain('dbt run\nDatabase Error');
  });

  it('returns null when the terminal has no text', () => {
    expect(buildTerminalAiPrompt('  ', [], [])).toBeNull();
  });
});
