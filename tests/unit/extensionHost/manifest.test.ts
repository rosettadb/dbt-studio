import {
  extensionIdOf,
  orderByDependencies,
  parseExtensionManifest,
  satisfiesEngine,
  type ExtensionManifest,
} from '../../../src/extensionHost/shared/manifest.shared';

const valid = {
  name: 'hello',
  publisher: 'acme',
  version: '1.2.3',
  engines: { rosettaStudio: '^1.7.0' },
  renderer: 'dist/renderer.js',
};

const extension = (
  name: string,
  extensionDependencies?: string[],
): { id: string; manifest: ExtensionManifest } => ({
  id: `acme.${name}`,
  manifest: { ...valid, name, extensionDependencies },
});

describe('extension manifest', () => {
  it('accepts a valid manifest and ignores fields it does not know', () => {
    const result = parseExtensionManifest({
      ...valid,
      scripts: { build: 'x' },
    });

    expect(result).toEqual({ ok: true, manifest: expect.any(Object) });
    const { manifest } = result as { manifest: ExtensionManifest };
    expect(extensionIdOf(manifest)).toBe('acme.hello');
    expect(manifest).not.toHaveProperty('scripts');
  });

  it('reports every problem of an invalid manifest', () => {
    const result = parseExtensionManifest({
      name: 'Hello World',
      version: 'one',
      main: '../outside.js',
    });

    expect(result).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        expect.stringContaining('"name"'),
        expect.stringContaining('"publisher"'),
        expect.stringContaining('"version"'),
        expect.stringContaining('"engines.rosettaStudio"'),
        expect.stringContaining('"main"'),
      ]),
    });
  });

  it('needs at least one entry file', () => {
    const { renderer, ...withoutEntries } = valid;
    const result = parseExtensionManifest(withoutEntries);

    expect(renderer).toBeDefined();
    expect(result.ok).toBe(false);
  });

  it.each([
    ['1.7.8', '*', true],
    ['1.7.8', '1.7.8', true],
    ['1.7.8', '1.7.9', false],
    ['1.7.8', '>=1.7.0', true],
    ['1.7.8', '>=1.8.0', false],
    ['1.7.8', '^1.7.0', true],
    ['1.9.0', '^1.7.0', true],
    ['2.0.0', '^1.7.0', false],
    ['1.6.9', '^1.7.0', false],
    ['0.3.1', '^0.3.0', true],
    ['0.4.0', '^0.3.0', false],
    ['1.7.8', 'latest', false],
  ])('Studio %s against "%s" is %s', (studio, range, expected) => {
    expect(satisfiesEngine(studio, range)).toBe(expected);
  });
});

describe('dependency order', () => {
  it('puts each extension after what it depends on', () => {
    const { ordered, unresolved } = orderByDependencies([
      extension('dbt', ['acme.sql']),
      extension('sql'),
      extension('analytics', ['acme.sql', 'acme.dbt']),
    ]);

    expect(ordered.map((item) => item.id)).toEqual([
      'acme.sql',
      'acme.dbt',
      'acme.analytics',
    ]);
    expect(unresolved).toEqual([]);
  });

  it('leaves out an extension whose dependency is missing, and its dependants', () => {
    const { ordered, unresolved } = orderByDependencies([
      extension('sql'),
      extension('dbt', ['acme.gone']),
      extension('charts', ['acme.dbt']),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['acme.sql']);
    expect(unresolved.map((item) => item.extension.id).sort()).toEqual([
      'acme.charts',
      'acme.dbt',
    ]);
  });

  it('leaves out extensions that depend on each other in a circle', () => {
    const { ordered, unresolved } = orderByDependencies([
      extension('a', ['acme.b']),
      extension('b', ['acme.a']),
      extension('c'),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['acme.c']);
    expect(unresolved).toHaveLength(2);
  });
});
