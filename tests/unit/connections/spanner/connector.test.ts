import { resetSpannerMock } from '../../__setup__/googleCloudSpanner.mock';
import type { SpannerConnection } from '../../../../src/connections/spanner/spanner.shared';

const deleteCredential = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    getCredential: jest.fn(),
    deleteCredential: (...args: unknown[]) => deleteCredential(...args),
  },
}));

/* eslint-disable import/first */
import { SpannerConnector } from '../../../../src/connections/spanner/SpannerConnector.main';
import { spannerDescriptor } from '../../../../src/connections/spanner/spanner.shared';
import {
  canUseAsDbtConnection,
  extraStoredKeyParts,
  getDescriptor,
} from '../../../../src/connections/registry.shared';
import { resolveConnectionCredentials } from '../../../../src/renderer/utils/notebookConnectionTransfer';
import {
  validateSpannerEmulatorHost,
  validateSpannerIds,
  validateSpannerKeyJson,
} from '../../../../src/connections/spanner/spanner.helpers.shared';

const KEY = JSON.stringify({
  type: 'service_account',
  client_email: 'svc@proj.iam.gserviceaccount.com',
  private_key: 'secret',
});

const conn = (patch: Partial<SpannerConnection> = {}): SpannerConnection => ({
  type: 'spanner',
  name: 'prod',
  username: '',
  password: '',
  project: 'my-project',
  instance: 'my-instance',
  database: 'my-db',
  schema: '',
  authMethod: 'adc',
  ...patch,
});

describe('SpannerConnector', () => {
  const connector = new SpannerConnector();
  beforeEach(() => {
    resetSpannerMock();
    deleteCredential.mockClear();
  });

  describe('validate', () => {
    it('accepts ADC, a raw key, a stored key name and the emulator', async () => {
      await expect(connector.validate(conn())).resolves.toBeUndefined();
      await expect(
        connector.validate(
          conn({ authMethod: 'service-account', keyfile: KEY }),
        ),
      ).resolves.toBeUndefined();
      await expect(
        connector.validate(
          conn({ authMethod: 'service-account', keyfile: 'db-spanner-prod' }),
        ),
      ).resolves.toBeUndefined();
      await expect(
        connector.validate(
          conn({ authMethod: 'emulator', emulatorHost: 'localhost:9010' }),
        ),
      ).resolves.toBeUndefined();
    });

    it.each([
      [{ authMethod: 'oauth' as never }, 'supported Spanner authentication'],
      [{ project: 'X' }, 'project ID'],
      [{ instance: '' }, 'instance ID'],
      [{ database: 'A' }, 'database ID'],
      [{ authMethod: 'service-account' as const }, 'key is required'],
      [
        { authMethod: 'service-account' as const, keyfile: '{"type":"x"}' },
        'client_email',
      ],
      [{ authMethod: 'emulator' as const, emulatorHost: 'nope' }, 'host:port'],
    ])('rejects %j', async (patch, message) => {
      await expect(connector.validate(conn(patch))).rejects.toThrow(message);
    });
  });

  it('is a validate-on-save, non-dbt connector', () => {
    expect(connector.validatesOnSave).toBe(true);
    expect(canUseAsDbtConnection('spanner')).toBe(false);
    expect(connector.descriptor).toBe(spannerDescriptor);
  });

  it('compares and names connections', () => {
    expect(connector.sameTarget(conn(), conn({ name: 'other' }))).toBe(true);
    expect(connector.sameTarget(conn(), conn({ instance: 'x-inst' }))).toBe(
      false,
    );
    expect(connector.sameTarget(conn(), conn({ authMethod: 'emulator' }))).toBe(
      false,
    );
    expect(connector.nameHint(conn())).toBe('my-db');
  });

  describe('key storage', () => {
    it('prepareForStorage replaces the raw key with the key name', () => {
      const stored = connector.prepareForStorage(
        conn({ authMethod: 'service-account', keyfile: KEY }),
      );
      expect(stored.keyfile).toBe('db-spanner-prod');
      expect(JSON.stringify(stored)).not.toContain('private_key');
      expect(stored).toMatchObject({ username: 'my-project', password: '' });
    });

    it('prepareForStorage keeps no key for ADC or the emulator', () => {
      expect(
        connector.prepareForStorage(conn({ keyfile: KEY })).keyfile,
      ).toBeUndefined();
      expect(
        connector.prepareForStorage(
          conn({ authMethod: 'emulator', keyfile: KEY }),
        ).keyfile,
      ).toBeUndefined();
    });

    it('sanitizeStoredConnection strips raw JSON in place and leaves a key name alone', () => {
      const raw = conn({ authMethod: 'service-account', keyfile: KEY });
      connector.sanitizeStoredConnection(raw);
      expect(raw.keyfile).toBe('db-spanner-prod');
      const named = conn({
        authMethod: 'service-account',
        keyfile: 'db-spanner-prod',
      });
      connector.sanitizeStoredConnection(named);
      expect(named.keyfile).toBe('db-spanner-prod');
    });

    it('onRename deletes the key left under the old name, only on a real rename', async () => {
      await connector.onRename(conn({ name: 'old' }), conn({ name: 'new' }));
      expect(deleteCredential).toHaveBeenCalledWith('db-spanner-old');
      deleteCredential.mockClear();
      await connector.onRename(conn({ name: 'same' }), conn({ name: 'same' }));
      expect(deleteCredential).not.toHaveBeenCalled();
    });

    it('is removed with the connection, and not exported with notebooks', async () => {
      expect(extraStoredKeyParts()).toContain('spanner');
      expect(getDescriptor('spanner')?.secrets).toEqual([
        { field: 'keyfile', key: 'spanner', exportable: false },
      ]);
      const getConnectionField = jest.fn().mockResolvedValue(KEY);
      const exported = await resolveConnectionCredentials(
        conn({ authMethod: 'service-account', keyfile: 'db-spanner-prod' }),
        { getConnectionField } as never,
      );
      expect(getConnectionField).not.toHaveBeenCalled();
      expect((exported as SpannerConnection).keyfile).toBe('db-spanner-prod');
    });
  });

  describe('agent hint', () => {
    const ctx = (agent: 'sql' | 'analytics' | 'notebooks') => ({
      agent,
      requestedType: 'spanner',
      duckdbVersion: '',
      ducklakeVersion: '',
    });

    it('covers both dialects', () => {
      const hint = connector.agentHint(ctx('sql'));
      expect(hint).toContain('Google Cloud Spanner');
      expect(hint).toContain('GoogleSQL');
      expect(hint).toContain('PostgreSQL dialect');
      expect(hint).toContain('Use LIMIT');
    });

    it('does not ask the notebook agent for LIMIT, which the UI strips', () => {
      const hint = connector.agentHint(ctx('notebooks'));
      expect(hint).toContain('Do not add row limits');
      expect(hint).not.toContain('Use LIMIT');
    });
  });
});

describe('spanner validation helpers', () => {
  it('accepts normal and domain-scoped project IDs', () => {
    const ids = { instance: 'my-instance', database: 'my-db' };
    expect(
      validateSpannerIds({ project: 'my-project', ...ids }),
    ).toBeUndefined();
    expect(
      validateSpannerIds({ project: 'example.com:my-project', ...ids }),
    ).toBeUndefined();
    expect(
      validateSpannerIds({ project: 'domain:my-project', ...ids }),
    ).toBeUndefined();
    expect(
      validateSpannerIds({ project: 'Bad_Project', ...ids }),
    ).toBeDefined();
  });

  it('checks the emulator host and the key JSON', () => {
    expect(validateSpannerEmulatorHost('localhost:9010')).toBe(true);
    expect(validateSpannerEmulatorHost('localhost')).toBe(false);
    expect(validateSpannerEmulatorHost('localhost:70000')).toBe(false);
    expect(validateSpannerKeyJson(KEY)).toBeUndefined();
    expect(validateSpannerKeyJson('not json')).toContain('valid JSON');
    expect(validateSpannerKeyJson('{"type":"service_account"}')).toContain(
      'client_email',
    );
  });
});
