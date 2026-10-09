import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import driver, { connection } from '../../../__setup__/oracledb.mock';
import {
  openOracleConnection,
  listOracleWalletAliases,
} from '../../../../../src/main/utils/oracleHelper';
import type { OracleConnection } from '../../../../../src/types/backend';

const conn: OracleConnection = {
  type: 'oracle',
  name: 'test',
  connectMode: 'basic',
  host: 'localhost',
  port: 1521,
  serviceName: 'FREEPDB1',
  username: 'STUDIO',
  password: '',
  database: '',
  schema: 'MixedCase',
};

describe('Oracle connection setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connection.thin = true;
    connection.execute.mockResolvedValue({ rows: [], metaData: [] });
    driver.getConnection.mockResolvedValue(connection);
  });
  it('uses secure options and quotes the current schema', async () => {
    await openOracleConnection(
      { ...conn, tls: true, port: 2484 },
      { password: 'secret' },
    );
    expect(driver.getConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'STUDIO',
        password: 'secret',
        connectString: 'tcps://localhost:2484/FREEPDB1',
        connectTimeout: 10,
        transportConnectTimeout: 10,
        sslServerDNMatch: true,
      }),
    );
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('NLS_TIMESTAMP_FORMAT'),
    );
    expect(connection.execute).toHaveBeenCalledWith(
      'ALTER SESSION SET CURRENT_SCHEMA = "MixedCase"',
    );
    expect(connection.callTimeout).toBe(600000);
  });
  it('passes a descriptor unchanged and escapes schema quotes', async () => {
    await openOracleConnection(
      {
        ...conn,
        connectMode: 'connectString',
        connectString: '(DESCRIPTION=(CONNECT_DATA=(SID=ORCL)))',
        schema: '"a""b"',
      },
      { password: 'secret' },
    );
    expect(driver.getConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        connectString: '(DESCRIPTION=(CONNECT_DATA=(SID=ORCL)))',
      }),
    );
    expect(connection.execute).toHaveBeenCalledWith(
      'ALTER SESSION SET CURRENT_SCHEMA = "a""b"',
    );
  });
  it('validates wallet files and sends aliases with main-only secrets', async () => {
    const walletDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'oracle-wallet-'),
    );
    try {
      await fs.writeFile(path.join(walletDir, 'ewallet.pem'), 'test fixture');
      await fs.writeFile(
        path.join(walletDir, 'tnsnames.ora'),
        'db_low=(DESCRIPTION=(ADDRESS=(PROTOCOL=tcps)))',
      );
      expect(await listOracleWalletAliases(walletDir)).toEqual(['db_low']);
      await openOracleConnection(
        { ...conn, connectMode: 'wallet', walletDir, connectString: 'db_low' },
        { password: 'secret', walletPassword: 'wallet-secret' },
      );
      expect(driver.getConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          configDir: walletDir,
          walletLocation: walletDir,
          walletPassword: 'wallet-secret',
          connectString: 'db_low',
        }),
      );
      await expect(
        openOracleConnection(
          {
            ...conn,
            connectMode: 'wallet',
            walletDir,
            connectString: 'absent',
          },
          { password: 'secret' },
        ),
      ).rejects.toThrow('not found');
      await fs.rm(path.join(walletDir, 'ewallet.pem'));
      await expect(listOracleWalletAliases(walletDir)).rejects.toThrow();
    } finally {
      await fs.rm(walletDir, { recursive: true, force: true });
    }
  });
  it('closes on session failure and scrubs credentials', async () => {
    connection.execute.mockRejectedValueOnce(
      new Error('secret wallet-secret failed'),
    );
    await expect(
      openOracleConnection(conn, {
        password: 'secret',
        walletPassword: 'wallet-secret',
      }),
    ).rejects.toThrow('[redacted] [redacted] failed');
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
  it('rejects a non-Thin connection and closes it', async () => {
    connection.thin = false;
    await expect(
      openOracleConnection(conn, { password: 'secret' }),
    ).rejects.toThrow('Thin');
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});
