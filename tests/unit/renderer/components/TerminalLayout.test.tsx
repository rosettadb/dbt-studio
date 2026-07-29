import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TerminalLayout } from '../../../../src/renderer/components/terminal';

let terminalMounts = 0;
let terminalUnmounts = 0;

jest.mock('split-pane-react', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('../../../../src/renderer/components/terminal/terminal', () => ({
  Terminal: () => {
    React.useEffect(() => {
      terminalMounts += 1;
      return () => {
        terminalUnmounts += 1;
      };
    }, []);
    return <div>terminal-content</div>;
  },
}));

jest.mock(
  '../../../../src/renderer/components/terminal/processTerminal',
  () => ({
    ProcessTerminal: () => <div>process-terminal</div>,
  }),
);

jest.mock('../../../../src/renderer/hooks', () => ({
  useProcess: () => ({
    isRunning: false,
    stop: jest.fn(),
    forceStop: jest.fn(),
    pid: null,
    duration: null,
    status: 'stopped',
    command: null,
  }),
}));

jest.mock('../../../../src/renderer/hooks/useSelectedFileContext', () => ({
  useSelectedFileContext: () => ({ selectedFilePath: undefined }),
}));

jest.mock('../../../../src/renderer/controllers', () => ({
  useCurrentModelId: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('../../../../src/renderer/components/lineage', () => ({
  LineageModal: () => null,
  LineageView: () => null,
}));

describe('TerminalLayout', () => {
  beforeEach(() => {
    terminalMounts = 0;
    terminalUnmounts = 0;
  });

  it('keeps terminal content mounted while minimized and restored', () => {
    render(
      <TerminalLayout
        project={{
          id: 'project-1',
          name: 'Project',
          path: '/project',
          createdAt: '',
        }}
      >
        <div>editor</div>
      </TerminalLayout>,
    );

    expect(terminalMounts).toBe(1);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(terminalUnmounts).toBe(0);

    fireEvent.click(screen.getByText('Terminal'));
    expect(screen.getByText('terminal-content')).toBeInTheDocument();
    expect(terminalMounts).toBe(1);
    expect(terminalUnmounts).toBe(0);
  });
});
