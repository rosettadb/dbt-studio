/**
 * The extension manifest: the `package.json` at the root of an extension.
 * Shared by the main process, the renderer and the internal extensions, so
 * this file imports nothing.
 */

export interface ExtensionManifest {
  /** Lowercase letters, digits and dashes. With `publisher` it forms the id. */
  name: string;
  /** Lowercase letters, digits and dashes. */
  publisher: string;
  version: string;
  displayName?: string;
  description?: string;
  /** Studio versions this extension runs on: `*`, `1.8.0`, `^1.8.0`, `>=1.8.0`. */
  engines: { rosettaStudio: string };
  /** Main-process entry, relative to the extension root (CommonJS). */
  main?: string;
  /** UI entry, relative to the extension root. */
  renderer?: string;
  /** Ids (`publisher.name`) that must be active before this extension. */
  extensionDependencies?: string[];
  /** True when the extension cannot be switched on or off without a restart. */
  requiresRestart?: boolean;
}

/** `builtin` ships inside the app; `installed` lives in the user's folder. */
export type ExtensionSource = 'builtin' | 'installed';

export type ExtensionState =
  /** Switched off by the user. */
  | 'disabled'
  /** Enabled but not running (not started yet, or stopped). */
  | 'inactive'
  | 'active'
  /** Loading or `activate` threw; `error` has the message. */
  | 'failed'
  /** Enabled but not started: wrong Studio version or a dependency problem. */
  | 'blocked';

/** What the host knows about one extension. Sent to the renderer as is. */
export interface ExtensionDescription {
  id: string;
  manifest: ExtensionManifest;
  source: ExtensionSource;
  /** Folder of an installed extension. Absent for internal ones. */
  location?: string;
  enabled: boolean;
  /** State of the main-process half. */
  state: ExtensionState;
  error?: string;
  /** A restart is needed before the last change fully applies. */
  restartPending?: boolean;
}

export const MANIFEST_FILE = 'package.json';

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export const extensionIdOf = (
  manifest: Pick<ExtensionManifest, 'publisher' | 'name'>,
): string => `${manifest.publisher}.${manifest.name}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRelativeEntry = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.startsWith('/') &&
  !value.startsWith('\\') &&
  !/^[a-zA-Z]:/.test(value) &&
  !value.split(/[\\/]/).includes('..');

export type ManifestParseResult =
  | { ok: true; manifest: ExtensionManifest }
  | { ok: false; errors: string[] };

/**
 * Validates an unknown value (a parsed package.json) and returns the fields
 * Studio uses. Unknown fields are ignored, so the file can carry whatever
 * else npm or a bundler needs.
 */
export const parseExtensionManifest = (raw: unknown): ManifestParseResult => {
  if (!isRecord(raw)) {
    return { ok: false, errors: ['The manifest is not an object'] };
  }
  const errors: string[] = [];
  const text = (key: string): string | undefined =>
    typeof raw[key] === 'string' ? (raw[key] as string) : undefined;

  const name = text('name');
  const publisher = text('publisher');
  const version = text('version');
  if (!name || !NAME_PATTERN.test(name)) {
    errors.push('"name" must be lowercase letters, digits and dashes');
  }
  if (!publisher || !NAME_PATTERN.test(publisher)) {
    errors.push('"publisher" must be lowercase letters, digits and dashes');
  }
  if (!version || !VERSION_PATTERN.test(version)) {
    errors.push('"version" must look like 1.2.3');
  }

  const engine = isRecord(raw.engines) ? raw.engines.rosettaStudio : undefined;
  if (typeof engine !== 'string' || engine.length === 0) {
    errors.push('"engines.rosettaStudio" is required');
  }

  if (raw.main !== undefined && !isRelativeEntry(raw.main)) {
    errors.push('"main" must be a path inside the extension');
  }
  if (raw.renderer !== undefined && !isRelativeEntry(raw.renderer)) {
    errors.push('"renderer" must be a path inside the extension');
  }
  if (raw.main === undefined && raw.renderer === undefined) {
    errors.push('The manifest needs a "main" or a "renderer" entry');
  }

  const dependencies = raw.extensionDependencies;
  if (
    dependencies !== undefined &&
    !(
      Array.isArray(dependencies) &&
      dependencies.every((dependency) => typeof dependency === 'string')
    )
  ) {
    errors.push('"extensionDependencies" must be a list of extension ids');
  }
  if (
    raw.requiresRestart !== undefined &&
    typeof raw.requiresRestart !== 'boolean'
  ) {
    errors.push('"requiresRestart" must be true or false');
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    manifest: {
      name: name!,
      publisher: publisher!,
      version: version!,
      displayName: text('displayName'),
      description: text('description'),
      engines: { rosettaStudio: engine as string },
      main: raw.main as string | undefined,
      renderer: raw.renderer as string | undefined,
      extensionDependencies: dependencies as string[] | undefined,
      requiresRestart: raw.requiresRestart as boolean | undefined,
    },
  };
};

type VersionParts = [number, number, number];

const parseVersion = (value: string): VersionParts | null => {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareVersions = (a: VersionParts, b: VersionParts): number => {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
};

/**
 * Whether Studio version `studioVersion` is inside `range`. Supports `*`, an
 * exact version, `>=x.y.z` and `^x.y.z` (same major; same minor when the
 * major is 0). An unreadable range does not match.
 */
export const satisfiesEngine = (
  studioVersion: string,
  range: string,
): boolean => {
  const wanted = range.trim();
  if (wanted === '*') return true;
  const studio = parseVersion(studioVersion);
  if (!studio) return false;

  if (wanted.startsWith('>=')) {
    const min = parseVersion(wanted.slice(2));
    return !!min && compareVersions(studio, min) >= 0;
  }
  if (wanted.startsWith('^')) {
    const min = parseVersion(wanted.slice(1));
    if (!min || compareVersions(studio, min) < 0) return false;
    return min[0] === 0
      ? studio[0] === 0 && studio[1] === min[1]
      : studio[0] === min[0];
  }
  const exact = parseVersion(wanted);
  return !!exact && compareVersions(studio, exact) === 0;
};

export interface DependencyOrder<T> {
  /** Each extension after everything it depends on. */
  ordered: T[];
  /** Extensions that cannot run, with the reason. */
  unresolved: Array<{ extension: T; reason: string }>;
}

/**
 * Orders extensions so each comes after the ones it depends on. An extension
 * with a dependency that is absent from the list, or inside a dependency
 * cycle, lands in `unresolved`, and so does everything that depends on it.
 */
export const orderByDependencies = <
  T extends { id: string; manifest: ExtensionManifest },
>(
  extensions: T[],
): DependencyOrder<T> => {
  const byId = new Map(
    extensions.map((extension) => [extension.id, extension]),
  );
  const ordered: T[] = [];
  const unresolved: Array<{ extension: T; reason: string }> = [];
  const visitState = new Map<string, 'visiting' | 'done' | 'failed'>();

  const visit = (extension: T): boolean => {
    const current = visitState.get(extension.id);
    if (current === 'done') return true;
    if (current === 'failed') return false;
    if (current === 'visiting') {
      visitState.set(extension.id, 'failed');
      unresolved.push({ extension, reason: 'Dependency cycle' });
      return false;
    }
    visitState.set(extension.id, 'visiting');

    const failedDependency = (
      extension.manifest.extensionDependencies ?? []
    ).find((dependencyId) => {
      const dependency = byId.get(dependencyId);
      return !dependency || !visit(dependency);
    });

    // A cycle through this extension was reported while visiting below.
    if (visitState.get(extension.id) === 'failed') return false;
    if (failedDependency) {
      visitState.set(extension.id, 'failed');
      unresolved.push({
        extension,
        reason: `Needs "${failedDependency}", which is missing, disabled or failed`,
      });
      return false;
    }
    visitState.set(extension.id, 'done');
    ordered.push(extension);
    return true;
  };

  extensions.forEach((extension) => visit(extension));
  return { ordered, unresolved };
};
