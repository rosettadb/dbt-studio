import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { UnsavedChangesDialog } from '../../../../src/renderer/components/editor/unsavedChangesDialog';

describe('UnsavedChangesDialog', () => {
  it('should render file name and call action handlers', () => {
    const onSave = jest.fn();
    const onDiscard = jest.fn();
    const onCancel = jest.fn();

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
        <UnsavedChangesDialog
          open
          fileName="model.sql"
          onSave={onSave}
          onDiscard={onDiscard}
          onCancel={onCancel}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    expect(screen.getByText('model.sql')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: "Don't Save" }));
    });
    expect(onDiscard).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByLabelText('Close'));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
