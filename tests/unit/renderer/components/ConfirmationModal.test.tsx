import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { ConfirmationModal } from '../../../../src/renderer/components/modals/confirmationModal';

describe('ConfirmationModal', () => {
  it('should render title/question and call handlers', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();

    const theme = createTheme({
      components: {
        MuiButtonBase: {
          defaultProps: {
            disableRipple: true,
          },
        },
      },
    });

    render(
      <ThemeProvider theme={theme}>
        <ConfirmationModal
          isOpen
          onClose={onClose}
          onConfirm={onConfirm}
          title="Confirm"
          question="Are you sure?"
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /ok/i }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByLabelText('close'));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
