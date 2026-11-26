import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  WILL_SAVE_TIMEOUT_MS,
  emitFileDidClose,
  emitFileDidOpen,
  emitFileDidSave,
  onDidCloseFile,
  onDidOpenFile,
  onDidSaveFile,
  onWillSaveFile,
  runWillSaveParticipants,
  setSavedContentSink,
} from '../../../src/extensionHost/renderer/documents.renderer';
import { saveDocument } from '../../../src/renderer/services/projects.service';
import { editorActions } from '../../../src/extensionHost/renderer/contributions.renderer';
import { EditorActions } from '../../../src/renderer/components/editor/EditorActions';
import type { EditorActionContext } from '../../../src/extensionApi/renderer';

const FILE = '/proj/models/a.sql';
const willSave = (content: string, reason = 'manual' as const) =>
  runWillSaveParticipants({ path: FILE, content, reason });

const invoke = () => (window as any).electron.ipcRenderer.invoke as jest.Mock;

let disposables: Array<{ dispose: () => void }> = [];
const keep = <T extends { dispose: () => void }>(disposable: T): T => {
  disposables.push(disposable);
  return disposable;
};

afterEach(() => {
  disposables.forEach((disposable) => disposable.dispose());
  disposables = [];
  setSavedContentSink(null);
  jest.useRealTimers();
});

describe('before a file is saved', () => {
  it('writes the content unchanged when nobody takes part', async () => {
    await expect(willSave('select 1')).resolves.toBe('select 1');
  });

  it('lets each participant change what the next one sees and what is written', async () => {
    const seen: string[] = [];
    keep(
      onWillSaveFile(({ content, reason, path }) => {
        seen.push(`${reason} ${path} ${content}`);
        return content.toUpperCase();
      }),
    );
    keep(
      onWillSaveFile(async ({ content }) => {
        seen.push(content);
        return `${content};`;
      }),
    );
    // Returning nothing leaves the content as it is.
    keep(onWillSaveFile(() => undefined));

    await expect(willSave('select 1')).resolves.toBe('SELECT 1;');
    expect(seen).toEqual([`manual ${FILE} select 1`, 'SELECT 1']);
  });

  it('skips a participant that throws; the save goes on', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    keep(
      onWillSaveFile(() => {
        throw new Error('formatter crashed');
      }),
    );
    keep(onWillSaveFile(({ content }) => `${content}\n`));

    await expect(willSave('select 1')).resolves.toBe('select 1\n');
  });

  it('skips a participant that takes too long', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.useFakeTimers();
    // A participant that never finishes
    keep(onWillSaveFile(() => new Promise<string>(() => {})));

    const saving = willSave('select 1');
    await jest.advanceTimersByTimeAsync(WILL_SAVE_TIMEOUT_MS + 1);

    await expect(saving).resolves.toBe('select 1');
  });

  it('stops taking part once disposed', async () => {
    const participant = onWillSaveFile(() => 'changed');
    participant.dispose();

    await expect(willSave('select 1')).resolves.toBe('select 1');
  });
});

describe('saving a project file', () => {
  beforeEach(() => invoke().mockReset().mockResolvedValue(true));

  it('writes what the pre-save hooks made of the content and reports it', async () => {
    const reasons: string[] = [];
    keep(
      onWillSaveFile(({ content, reason }) => {
        reasons.push(reason);
        return content.trim();
      }),
    );
    const sink = jest.fn();
    setSavedContentSink(sink);

    const written = await saveDocument(
      { path: FILE, content: '  select 1  ' },
      { reason: 'manual' },
    );

    expect(invoke()).toHaveBeenCalledWith('project:updateFile', {
      path: FILE,
      content: 'select 1',
    });
    expect(written).toEqual({ saved: true, content: 'select 1' });
    expect(reasons).toEqual(['manual']);
    // The open tab is told, so it shows what is on disk.
    expect(sink).toHaveBeenCalledWith(FILE, 'select 1');
  });

  it('writes the content as given when no hook changes it', async () => {
    const sink = jest.fn();
    setSavedContentSink(sink);
    const reasons: string[] = [];
    keep(
      onWillSaveFile(({ reason }) => {
        reasons.push(reason);
      }),
    );

    await saveDocument({ path: FILE, content: 'select 1' });

    expect(invoke()).toHaveBeenCalledWith('project:updateFile', {
      path: FILE,
      content: 'select 1',
    });
    expect(sink).not.toHaveBeenCalled();
    // A save nobody labelled is a programmatic one.
    expect(reasons).toEqual(['programmatic']);
  });
});

describe('after a file is saved, opened or closed', () => {
  it('tells every listener, and a failing one does not stop the rest', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const saved = jest.fn();
    const opened = jest.fn();
    const closed = jest.fn();
    keep(
      onDidSaveFile(() => {
        throw new Error('listener crashed');
      }),
    );
    keep(onDidSaveFile(saved));
    keep(onDidOpenFile(opened));
    keep(onDidCloseFile(closed));

    emitFileDidSave({ path: FILE, source: 'agent' });
    emitFileDidOpen(FILE);
    emitFileDidClose(FILE);

    expect(saved).toHaveBeenCalledWith({ path: FILE, source: 'agent' });
    expect(opened).toHaveBeenCalledWith({ path: FILE });
    expect(closed).toHaveBeenCalledWith({ path: FILE });
  });
});

describe('buttons in the bar above the code editor', () => {
  const RunButton: React.FC<EditorActionContext> = ({ tab }) => (
    <button type="button">Run {tab.title}</button>
  );
  const FormatButton: React.FC<EditorActionContext> = ({ language }) => (
    <button type="button">Format {language}</button>
  );

  const renderFor = (path: string, language: string) =>
    render(
      <EditorActions
        tab={{
          id: path,
          path,
          title: path.split('/').pop()!,
          content: '',
          isModified: false,
          isLoading: false,
        }}
        projectPath="/proj"
        language={language}
      />,
    );

  it('shows the actions that match the open file, in order', () => {
    keep(
      editorActions.add({
        id: 'test.format',
        order: 200,
        when: () => true,
        Component: FormatButton,
      }),
    );
    keep(
      editorActions.add({
        id: 'test.run',
        order: 100,
        when: ({ language }) => language === 'sql',
        Component: RunButton,
      }),
    );

    const sql = renderFor(FILE, 'sql');
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Run a.sql', 'Format sql']);
    sql.unmount();

    renderFor('/proj/README.md', 'markdown');
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Format markdown']);
  });
});
