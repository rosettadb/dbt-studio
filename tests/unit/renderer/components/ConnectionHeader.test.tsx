import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ConnectionHeader from '../../../../src/renderer/components/connections/connection-header';

const renderHeader = (isLoading = false) => {
  const onClose = jest.fn();
  const onSave = jest.fn();
  const { container } = render(
    <div data-testid="form-root">
      <ConnectionHeader
        title="Postgres"
        imageSource="postgres.png"
        onClose={onClose}
        onSave={onSave}
        isLoading={isLoading}
      />
      <form>
        <input aria-label="Host" />
      </form>
    </div>,
  );
  return { onClose, onSave, container };
};

describe('ConnectionHeader', () => {
  it('calls onClose and onSave from the action buttons', () => {
    const { onClose, onSave } = renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while saving', () => {
    renderHeader(true);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });

  it('pins the action bar to the top of the scroll area', () => {
    renderHeader();

    const actionBar = screen.getByText('Setup connection').parentElement;
    expect(actionBar).toHaveStyle({ position: 'sticky', top: '0px' });
  });

  it('renders the action bar directly in the form so it stays pinned for the whole form', () => {
    renderHeader();

    // A wrapper around the bar would limit how long it stays pinned
    const actionBar = screen.getByText('Setup connection').parentElement;
    expect(actionBar?.parentElement).toBe(screen.getByTestId('form-root'));
    expect(screen.getByRole('img', { name: 'Postgres' })).toBeInTheDocument();
  });

  it('leaves room above form fields so focused fields are not hidden behind the bar', () => {
    renderHeader();

    expect(screen.getByLabelText('Host')).toHaveStyle({
      scrollMarginTop: '80px',
    });
  });
});
