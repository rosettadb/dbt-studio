import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Oracle } from '../../../src/renderer/components/connections/oracle';

const configure = jest.fn().mockResolvedValue('new-id');
const update = jest.fn().mockResolvedValue(undefined);
const testConnection = jest
  .fn()
  .mockResolvedValue({ success: true, database: 'FREE' });
const setDatabaseUsername = jest.fn().mockResolvedValue(undefined);
const setDatabasePassword = jest.fn().mockResolvedValue(undefined);
const setConnectionField = jest.fn().mockResolvedValue(undefined);
const getDatabasePassword = jest.fn().mockResolvedValue('saved-secret');
const getConnectionField = jest.fn().mockResolvedValue('saved-wallet');
const navigate = jest.fn();
const secure = {
  setDatabaseUsername,
  setDatabasePassword,
  setConnectionField,
  getDatabasePassword,
  getConnectionField,
};

jest.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
jest.mock('../../../src/renderer/controllers', () => ({
  useConfigureConnection: () => ({ mutateAsync: configure }),
  useUpdateConnection: () => ({ mutateAsync: update }),
  useTestConnection: () => ({ mutateAsync: testConnection, isLoading: false }),
  useGetConnections: () => ({ data: [] }),
  useFilePicker: () => ({
    mutateAsync: jest.fn().mockResolvedValue(['/wallet']),
  }),
}));
jest.mock('../../../src/renderer/controllers/connectors.controller', () => ({
  useOracleWalletAliases: () => ({
    data: ['db_low'],
    isFetching: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('../../../src/renderer/hooks/useSecureStorage', () => ({
  __esModule: true,
  default: () => secure,
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const fillBasic = () => {
  fireEvent.change(screen.getByLabelText(/^Host/), {
    target: { value: 'localhost' },
  });
  fireEvent.change(screen.getByLabelText(/^Service name/), {
    target: { value: 'FREEPDB1' },
  });
  fireEvent.change(screen.getByLabelText(/^Username/), {
    target: { value: 'STUDIO' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'entered-secret' },
  });
};

describe('Oracle connection form', () => {
  beforeEach(() => jest.clearAllMocks());
  it('changes the default TLS port until the user edits it', () => {
    render(<Oracle onCancel={jest.fn()} />);
    expect(screen.getByLabelText(/^Port/)).toHaveValue(1521);
    fireEvent.click(screen.getByLabelText('Enable TLS'));
    expect(screen.getByLabelText(/^Port/)).toHaveValue(2484);
    fireEvent.change(screen.getByLabelText(/^Port/), {
      target: { value: '9999' },
    });
    fireEvent.click(screen.getByLabelText('Enable TLS'));
    expect(screen.getByLabelText(/^Port/)).toHaveValue(9999);
  });
  it('saves credentials in keytar while submitting an empty password', async () => {
    render(<Oracle onCancel={jest.fn()} />);
    fillBasic();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(configure).toHaveBeenCalledWith({
        connection: expect.objectContaining({
          type: 'oracle',
          password: '',
          username: 'STUDIO',
        }),
      }),
    );
    expect(setDatabasePassword).toHaveBeenCalledWith(
      'entered-secret',
      'Oracle Connection',
    );
    expect(setConnectionField).toHaveBeenCalledWith(
      'walletpassword',
      '',
      'Oracle Connection',
    );
  });
  it('fills the database from a successful test and masks the password', async () => {
    render(<Oracle onCancel={jest.fn()} />);
    fillBasic();
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Database')).toHaveValue('FREE'),
    );
    expect(testConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: '"STUDIO"',
        password: 'entered-secret',
      }),
    );
  });
  it('shows connect-string and wallet inputs only in their modes', () => {
    render(<Oracle onCancel={jest.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'String' }));
    expect(screen.getByLabelText(/^Connect string/)).toBeVisible();
    expect(screen.queryByLabelText(/^Host/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Wallet' }));
    expect(screen.getByLabelText(/^Wallet folder/)).toBeVisible();
    expect(screen.getByLabelText('Wallet password (optional)')).toHaveAttribute(
      'type',
      'password',
    );
  });
  it('loads duplicate credentials, preserves quoted schema case and saves under the new name', async () => {
    const source = {
      id: 'original',
      connection: {
        type: 'oracle',
        name: 'original',
        connectMode: 'basic',
        host: 'localhost',
        port: 1521,
        serviceName: 'FREEPDB1',
        username: 'STUDIO',
        password: '',
        database: 'FREE',
        schema: 'MixedCase',
      },
    } as any;
    render(
      <Oracle
        onCancel={jest.fn()}
        duplicateFrom={source}
        suggestedName="copy"
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Password')).toHaveValue('saved-secret'),
    );
    expect(screen.getByLabelText('Schema')).toHaveValue('"MixedCase"');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(setDatabasePassword).toHaveBeenCalledWith('saved-secret', 'copy'),
    );
    expect(configure).toHaveBeenCalledWith({
      connection: expect.objectContaining({ name: 'copy', password: '' }),
    });
  });
});
