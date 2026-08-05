import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ResetFactoryModal } from '../../../../src/renderer/components/modals/resetFactoryModal';

describe('ResetFactoryModal', () => {
  it('describes the expanded cleanup scope and retained external data', () => {
    render(
      <ResetFactoryModal
        isOpen
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );

    expect(
      screen.getByText(/All notebooks, including archived notebooks/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/MCP configuration and installed Agent Skills/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/External databases, cloud objects, and DuckLake/i),
    ).toBeInTheDocument();
  });

  it('prevents cancellation and duplicate confirmation while resetting', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    render(
      <ResetFactoryModal
        isOpen
        isLoading
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resetting...' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
