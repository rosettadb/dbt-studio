import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { toast } from 'react-toastify';

import { AddConnectionModal } from '../../../../src/renderer/components/modals/addConnectionModal';

// Analytics projects also list DuckLake instances
jest.mock('../../../../src/renderer/controllers', () => ({
  useDuckLakeInstances: () => ({
    data: [{ id: 'lake1', name: 'sales_lake' }],
  }),
}));

jest.mock('react-toastify', () => {
  return {
    toast: {
      error: jest.fn(),
      success: jest.fn(),
    },
  };
});

describe('AddConnectionModal', () => {
  const theme = createTheme({
    components: {
      MuiButtonBase: {
        defaultProps: {
          disableRipple: true,
        },
      },
    },
  });

  const renderModal = (
    props: React.ComponentProps<typeof AddConnectionModal>,
  ) => {
    return render(
      <ThemeProvider theme={theme}>
        <AddConnectionModal
          isOpen={props.isOpen}
          onClose={props.onClose}
          project={props.project}
          connections={props.connections}
          onSuccess={props.onSuccess}
          onUpdateProject={props.onUpdateProject}
        />
      </ThemeProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow selecting a connection and submitting', async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    const onUpdateProject = jest.fn();

    renderModal({
      isOpen: true,
      onClose,
      onSuccess,
      onUpdateProject,
      project: { id: 'p1', name: 'My Project' } as any,
      connections: [
        {
          id: 'c1',
          connection: { name: 'Conn 1', type: 'postgres' },
        },
      ] as any,
    });

    expect(screen.getByText('Add Connection to Project')).toBeInTheDocument();

    // MUI Select: open menu
    act(() => {
      fireEvent.mouseDown(screen.getByLabelText('Connection'));
    });

    act(() => {
      fireEvent.click(screen.getByText('Conn 1'));
    });

    const addButton = screen.getByRole('button', { name: 'Add Connection' });

    act(() => {
      fireEvent.click(addButton);
    });

    expect(onUpdateProject).toHaveBeenCalledWith({
      id: 'p1',
      name: 'My Project',
      connectionId: 'c1',
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('should show toast error when project is missing (even if a connection is selected)', () => {
    const onClose = jest.fn();
    const onUpdateProject = jest.fn();

    renderModal({
      isOpen: true,
      onClose,
      onUpdateProject,
      project: null,
      connections: [
        {
          id: 'c1',
          connection: { name: 'Conn 1', type: 'postgres' },
        },
      ] as any,
    });

    act(() => {
      fireEvent.mouseDown(screen.getByLabelText('Connection'));
    });

    act(() => {
      fireEvent.click(screen.getByText('Conn 1'));
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Connection' }));
    });

    expect(toast.error).toHaveBeenCalledWith('Please select a connection');
    expect(onUpdateProject).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('links an Analytics project to a DuckLake instance itself', () => {
    const onUpdateProject = jest.fn();
    renderModal({
      isOpen: true,
      onClose: jest.fn(),
      onUpdateProject,
      project: { id: 'p2', name: 'Lake', type: 'analytics' } as any,
      connections: [],
    });

    act(() => {
      fireEvent.mouseDown(screen.getByLabelText('Connection'));
    });
    act(() => {
      fireEvent.click(screen.getByText('sales_lake'));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Connection' }));
    });

    expect(onUpdateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p2', connectionId: 'ducklake-lake1' }),
    );
  });

  it('clears the selection after a submit, so the next project starts empty', () => {
    const props = {
      isOpen: true,
      onClose: jest.fn(),
      onUpdateProject: jest.fn(),
      connections: [],
    };
    const { rerender } = renderModal({
      ...props,
      project: { id: 'p2', name: 'Lake', type: 'analytics' } as any,
    });

    act(() => {
      fireEvent.mouseDown(screen.getByLabelText('Connection'));
    });
    act(() => {
      fireEvent.click(screen.getByText('sales_lake'));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Connection' }));
    });

    expect(props.onUpdateProject).toHaveBeenCalledTimes(1);
    expect(props.onUpdateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p2', connectionId: 'ducklake-lake1' }),
    );

    rerender(
      <ThemeProvider theme={theme}>
        <AddConnectionModal
          isOpen={props.isOpen}
          onClose={props.onClose}
          onUpdateProject={props.onUpdateProject}
          connections={props.connections}
          project={{ id: 'p3', name: 'Dbt' } as any}
        />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('button', { name: 'Add Connection' }),
    ).toBeDisabled();
  });

  it('does not offer DuckLake instances to a dbt project', () => {
    renderModal({
      isOpen: true,
      onClose: jest.fn(),
      onUpdateProject: jest.fn(),
      project: { id: 'p3', name: 'Dbt' } as any,
      connections: [],
    });

    act(() => {
      fireEvent.mouseDown(screen.getByLabelText('Connection'));
    });

    expect(screen.queryByText('sales_lake')).not.toBeInTheDocument();
  });
});
