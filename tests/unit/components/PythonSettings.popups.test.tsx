import React from 'react';
import { render } from '@testing-library/react';
import { toast } from 'react-toastify';
import { PythonSettings } from '../../../src/renderer/components/settings/PythonSettings';
import { INSTALL_CANCELLED_MESSAGE } from '../../../src/shared/installTasks';

// The settings components pull in the ESM-only markdown stack.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('remark-gfm', () => jest.fn());
jest.mock('rehype-raw', () => jest.fn());
jest.mock('rehype-highlight', () => jest.fn());
jest.mock('rehype-sanitize', () => jest.fn());

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Captures the callbacks the page passes to its install and uninstall calls.
const mockCallbacks: Record<string, any> = {};
jest.mock('../../../src/renderer/controllers', () => ({
  useCheckPythonVersions: () => ({ mutate: jest.fn(), isLoading: false }),
  useInstallPythonVersion: (options: any) => {
    mockCallbacks.install = options;
    return { mutate: jest.fn(), isLoading: false };
  },
  useUninstallPython: (options: any) => {
    mockCallbacks.uninstall = options;
    return { mutate: jest.fn(), isLoading: false };
  },
}));

jest.mock('../../../src/renderer/hooks/useIsTaskTypeActive', () => ({
  useIsTaskTypeActive: () => false,
}));

describe('PythonSettings popups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    render(<PythonSettings settings={{ pythonPath: '' } as any} />);
  });

  it('keeps the popups dev shows when an install finishes or fails', () => {
    mockCallbacks.install.onSuccess({ success: true, version: '3.12.0' });
    expect(toast.success).toHaveBeenCalledWith(
      'Python 3.12.0 installed successfully',
    );

    mockCallbacks.install.onError(new Error('network down'));
    expect(toast.error).toHaveBeenCalledWith(
      'Installation failed: network down',
    );
  });

  it('shows no failure popup for an install cancelled while queued', () => {
    mockCallbacks.install.onError(
      new Error(`Error invoking remote method: ${INSTALL_CANCELLED_MESSAGE}`),
    );
    mockCallbacks.uninstall.onError(new Error(INSTALL_CANCELLED_MESSAGE));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
