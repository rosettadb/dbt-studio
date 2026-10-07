import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectionForm } from '../../../../src/renderer/components/cloudExplorer/ConnectionForm';

const save = jest.fn();
const test = jest.fn();
const secrets = {
  setCloudAwsSecret: jest.fn(),
  getCloudAwsSecret: jest.fn(),
  getCloudAwsSessionToken: jest.fn(),
  setCloudAwsSessionToken: jest.fn(),
  deleteCloudAwsSecret: jest.fn(),
  deleteCloudAwsSessionToken: jest.fn(),
};
jest.mock(
  '../../../../src/renderer/controllers/cloudExplorer.controller',
  () => ({
    useSaveConnection: () => ({ mutateAsync: save }),
    useTestCloudConnection: () => ({ mutateAsync: test }),
  }),
);
jest.mock('../../../../src/renderer/hooks/useSecureStorage', () => ({
  __esModule: true,
  default: () => secrets,
}));

function renderForm(
  props: Partial<React.ComponentProps<typeof ConnectionForm>> = {},
) {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ConnectionForm initialProvider="aws" onSaved={jest.fn()} {...props} />
    </MemoryRouter>,
  );
}

function fillNameAndRegion() {
  fireEvent.change(screen.getByLabelText(/Connection Name/), {
    target: { value: 'Public data' },
  });
  fireEvent.change(screen.getByLabelText(/^Region/), {
    target: { value: 'us-west-2' },
  });
}

describe('Public S3 connection form', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires credentials by default and a bucket name in public mode', async () => {
    renderForm();
    fillNameAndRegion();
    expect(
      screen.getByRole('button', { name: 'Test Connection' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Public bucket (no credentials)' }),
    );
    expect(screen.queryByLabelText(/Access Key ID/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Secret Access Key/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Test Connection' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Bucket name/), {
      target: { value: ' public-data ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
    await waitFor(() =>
      expect(test).toHaveBeenCalledWith({
        provider: 'aws',
        config: {
          authMode: 'public',
          bucket: 'public-data',
          region: 'us-west-2',
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Connection' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            authMode: 'public',
            bucket: 'public-data',
            region: 'us-west-2',
          },
        }),
      ),
    );
    expect(secrets.setCloudAwsSecret).not.toHaveBeenCalled();
    expect(secrets.deleteCloudAwsSecret).not.toHaveBeenCalled();
    expect(secrets.deleteCloudAwsSessionToken).not.toHaveBeenCalled();
  });

  it('clears stored credentials when an existing connection switches to public mode', async () => {
    secrets.getCloudAwsSecret.mockResolvedValue('old-secret');
    secrets.getCloudAwsSessionToken.mockResolvedValue('old-token');
    renderForm({
      isEditing: true,
      connectionId: 'existing',
      initialValues: {
        id: 'existing',
        name: 'Existing',
        provider: 'aws',
        created: new Date(),
        config: { region: 'us-west-2', accessKeyId: 'old-key' },
      },
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/Secret Access Key/)).toHaveValue(
        'old-secret',
      ),
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Public bucket (no credentials)' }),
    );
    fireEvent.change(screen.getByLabelText(/Bucket name/), {
      target: { value: 'public-data' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Connection' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            authMode: 'public',
            bucket: 'public-data',
            region: 'us-west-2',
          },
        }),
      ),
    );
    expect(secrets.deleteCloudAwsSecret).toHaveBeenCalledWith('existing');
    expect(secrets.deleteCloudAwsSessionToken).toHaveBeenCalledWith('existing');
    expect(secrets.setCloudAwsSecret).not.toHaveBeenCalled();
  });

  it.each(['initialValues', 'duplicateFrom'] as const)(
    'restores public mode from %s without reading secure storage',
    async (source) => {
      renderForm({
        [source]: {
          id: 'existing',
          name: 'Public data',
          provider: 'aws',
          created: new Date(),
          config: {
            authMode: 'public',
            bucket: 'public-data',
            region: 'us-west-2',
          },
        },
      });
      await waitFor(() =>
        expect(screen.getByLabelText(/Bucket name/)).toHaveValue('public-data'),
      );
      expect(
        screen.getByRole('checkbox', {
          name: 'Public bucket (no credentials)',
        }),
      ).toBeChecked();
      expect(secrets.getCloudAwsSecret).not.toHaveBeenCalled();
      expect(secrets.getCloudAwsSessionToken).not.toHaveBeenCalled();
    },
  );
});
