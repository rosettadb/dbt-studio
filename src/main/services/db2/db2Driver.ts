import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type * as IbmDb from 'ibm_db';

export type IbmDbModule = typeof IbmDb;

/**
 * Environment variables `ibm_db` rewrites while it loads. They are restored
 * afterwards so dbt, Python, Git and other child processes don't inherit IBM's
 * library paths.
 */
const ENV_KEYS_TOUCHED_ON_LOAD = [
  'IBM_DB_HOME',
  'PATH',
  'LIB',
  'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
  'LIBPATH',
] as const;

let driverPromise: Promise<IbmDbModule> | null = null;

/**
 * In a packaged app `ibm_db` resolves its CLI driver next to `__dirname`,
 * which is inside `app.asar`. The native libraries are unpacked, so point it
 * at `app.asar.unpacked` instead.
 */
const packagedClidriverHome = (): string | undefined => {
  if (!app?.isPackaged) return undefined;
  const home = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'ibm_db',
    'installer',
    'clidriver',
  );
  return fs.existsSync(home) ? home : undefined;
};

const restoreEnv = (saved: Map<string, string | undefined>) => {
  saved.forEach((value, key) => {
    // Windows resolves IBM's DLLs (including GSKit for SSL) through PATH when
    // a connection opens, so PATH keeps the driver's entries there.
    if (key === 'PATH' && process.platform === 'win32') return;
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
};

const loadDriver = async (): Promise<IbmDbModule> => {
  const saved = new Map<string, string | undefined>(
    ENV_KEYS_TOUCHED_ON_LOAD.map((key) => [key, process.env[key]]),
  );
  const home = packagedClidriverHome();
  if (home) {
    process.env.IBM_DB_HOME = home;
  }
  try {
    const mod = (await import('ibm_db')) as unknown as IbmDbModule & {
      default?: IbmDbModule;
    };
    return typeof mod.default?.open === 'function' ? mod.default : mod;
  } finally {
    restoreEnv(saved);
  }
};

/**
 * Loads `ibm_db` on first use and caches it. Other connection types never
 * load the native driver.
 */
export const getIbmDb = async (): Promise<IbmDbModule> => {
  if (!driverPromise) {
    driverPromise = loadDriver().catch((error: unknown) => {
      driverPromise = null;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Db2 driver unavailable: ${reason}`);
    });
  }
  return driverPromise;
};
