import React from 'react';
import {
  listTerminalPanels,
  registerTerminalPanel,
} from '../../../../src/renderer/components/terminal/panels/registry';

const Noop: React.FC = () => null;
const alwaysVisible = () => ({ visible: true });

describe('terminal panel registry', () => {
  it('keeps registration order as tab order', () => {
    registerTerminalPanel({
      id: 'a',
      label: 'A',
      useState: alwaysVisible,
      Component: Noop,
    });
    registerTerminalPanel({
      id: 'b',
      label: 'B',
      useState: alwaysVisible,
      Component: Noop,
    });

    expect(listTerminalPanels().map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('re-registering an id replaces the panel without moving it', () => {
    registerTerminalPanel({
      id: 'a',
      label: 'A2',
      useState: alwaysVisible,
      Component: Noop,
    });

    expect(listTerminalPanels().map((p) => `${p.id}:${p.label}`)).toEqual([
      'a:A2',
      'b:B',
    ]);
  });
});
