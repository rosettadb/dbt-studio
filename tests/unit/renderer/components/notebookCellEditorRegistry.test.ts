import {
  getActiveNotebookCellEditor,
  getActiveNotebookCellId,
  registerNotebookCellEditor,
  resetNotebookCellEditorRegistry,
  setActiveNotebookCell,
} from '../../../../src/renderer/components/notebook/notebookCellEditorRegistry';

const editor = (id: string) => ({ id }) as any;

describe('notebookCellEditorRegistry', () => {
  beforeEach(() => resetNotebookCellEditorRegistry());

  it('returns null until a cell is focused', () => {
    registerNotebookCellEditor('nb', 'c1', editor('e1'));
    expect(getActiveNotebookCellEditor('nb')).toBeNull();
    expect(getActiveNotebookCellId('nb')).toBeUndefined();
  });

  it('returns the focused cell editor', () => {
    const e1 = editor('e1');
    const e2 = editor('e2');
    registerNotebookCellEditor('nb', 'c1', e1);
    registerNotebookCellEditor('nb', 'c2', e2);

    setActiveNotebookCell('nb', 'c2');
    expect(getActiveNotebookCellEditor('nb')).toBe(e2);

    setActiveNotebookCell('nb', 'c1');
    expect(getActiveNotebookCellEditor('nb')).toBe(e1);
  });

  it('keeps notebooks isolated', () => {
    registerNotebookCellEditor('a', 'c1', editor('a1'));
    registerNotebookCellEditor('b', 'c1', editor('b1'));
    setActiveNotebookCell('a', 'c1');

    expect(getActiveNotebookCellEditor('a')).toEqual({ id: 'a1' });
    expect(getActiveNotebookCellEditor('b')).toBeNull();
  });

  it('forgets unmounted cells, including the active one', () => {
    const e1 = editor('e1');
    const unregister = registerNotebookCellEditor('nb', 'c1', e1);
    setActiveNotebookCell('nb', 'c1');

    unregister();
    expect(getActiveNotebookCellEditor('nb')).toBeNull();
    expect(getActiveNotebookCellId('nb')).toBeUndefined();
  });

  it('does not let a stale unregister remove a newer editor', () => {
    const stale = registerNotebookCellEditor('nb', 'c1', editor('old'));
    registerNotebookCellEditor('nb', 'c1', editor('new'));
    setActiveNotebookCell('nb', 'c1');

    stale();
    expect(getActiveNotebookCellEditor('nb')).toEqual({ id: 'new' });
  });
});
