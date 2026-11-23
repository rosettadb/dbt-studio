import {
  collectRequirements,
  defaultStepParams,
  expandMacros,
  parsePluginManifest,
  validateStepParams,
} from '../../../src/shared/pluginManifest';
import shipped from '../__fixtures__/plugins.json';

const byId = (raw: unknown) =>
  new Map(parsePluginManifest(raw).map((plugin) => [plugin.id, plugin]));

describe('plugin manifest', () => {
  it('reads the manifest the runner ships', () => {
    const plugins = byId(shipped);
    expect(Array.from(plugins.keys())).toEqual([
      'git_clone@v1',
      'dbt@v1',
      'rosetta@v1',
      'kinetica_cli@v1',
      's3@v1',
      'command@v1',
      'terraform@v1',
      'pyspark@v1',
    ]);
    expect(plugins.get('git_clone@v1')?.addable).toBe(false);
    expect(plugins.get('dbt@v1')).toMatchObject({
      label: 'dbt',
      color: '#FF694B',
      addable: true,
    });
    expect(
      plugins.get('pyspark@v1')?.widgets.map((widget) => widget.key),
    ).toContain('script');
  });

  it('gives a plugin without widgets the generic form', () => {
    const [plugin] = parsePluginManifest([
      { name: 'legacy@v1', script: 'legacy.sh' },
    ]);
    expect(plugin).toMatchObject({
      id: 'legacy@v1',
      label: 'legacy',
      category: 'Generic',
      addable: true,
    });
    expect(plugin.widgets.map((widget) => widget.key)).toEqual([
      'command',
      'working_dir',
    ]);
    expect(validateStepParams(plugin, {})).toEqual([
      { key: 'command', message: 'missing required field: Command' },
    ]);
  });

  it('skips what it does not understand instead of failing', () => {
    expect(parsePluginManifest({})).toEqual([]);
    expect(parsePluginManifest(null)).toEqual([]);
    const [plugin] = parsePluginManifest([
      'nonsense',
      { script: 'no-name.sh' },
      {
        name: 'future@v2',
        someNewField: { anything: true },
        color: 'red',
        widgets: [
          { key: 'speed', type: 'slider', label: 'Speed', newProp: 1 },
          { key: 'name', type: 'input' },
          { type: 'input' },
          { key: 'mode', type: 'dropdown', options: ['a', { value: 'b' }] },
        ],
        rules: [{ type: 'from_the_future', keys: ['speed'] }],
        requires: [{ id: 'tool' }],
      },
    ]);
    expect(plugin.color).toBeUndefined();
    expect(plugin.widgets).toHaveLength(2);
    // An unknown widget type is shown as a text input.
    expect(plugin.widgets[0]).toMatchObject({ key: 'speed', type: 'input' });
    expect(plugin.widgets[1].options).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
    ]);
    expect(plugin.rules).toEqual([]);
    expect(plugin.requires).toEqual([]);
  });

  it('checks required fields, visibility and rules', () => {
    const [plugin] = parsePluginManifest([
      {
        name: 'p@v1',
        widgets: [
          { key: 'mode', type: 'dropdown', options: ['file', 'inline'] },
          {
            key: 'path',
            type: 'file',
            label: 'Path',
            required: true,
            visible_when: { key: 'mode', equals: 'file' },
          },
          { key: 'a', type: 'input', label: 'A' },
          { key: 'b', type: 'input', label: 'B' },
          { key: 'token', type: 'input', label: 'Token' },
        ],
        rules: [
          { type: 'exactly_one', keys: ['a', 'b'] },
          {
            type: 'required_if',
            keys: ['token'],
            when: { key: 'mode', equals: 'inline' },
            message: 'Inline mode needs a token.',
          },
        ],
      },
    ]);
    const messages = (params: Record<string, unknown>) =>
      validateStepParams(plugin, params).map((issue) => issue.message);

    expect(messages({ mode: 'file', a: 'x' })).toEqual([
      'missing required field: Path',
    ]);
    // A hidden field is not required.
    expect(messages({ mode: 'inline', a: 'x', token: 't' })).toEqual([]);
    expect(messages({ mode: 'inline', a: 'x' })).toEqual([
      'Inline mode needs a token.',
    ]);
    expect(messages({ a: 'x', b: 'y' })).toEqual([
      'provide exactly one of: A, B',
    ]);
    expect(messages({})).toEqual(['provide exactly one of: A, B']);
    // false and 0 are values, not missing ones.
    expect(messages({ a: 0 })).toEqual([]);
  });

  it('applies the pyspark rule of the shipped manifest', () => {
    const pyspark = byId(shipped).get('pyspark@v1')!;
    expect(validateStepParams(pyspark, {})).toEqual([
      { message: 'Provide a script or a command.' },
    ]);
    expect(validateStepParams(pyspark, { script: 'jobs/etl.py' })).toEqual([]);
    expect(validateStepParams(pyspark, { command: 'python x.py' })).toEqual([]);
  });

  it('replaces macros when a default is put into a step', () => {
    expect(
      // eslint-disable-next-line no-template-curly-in-string
      expandMacros('${project.rosetta_dir}/x-${ nope }-${project.name}', {
        'project.rosetta_dir': 'rosetta',
        'project.name': 'demo',
      }),
    ).toBe('rosetta/x--demo');

    const plugins = byId(shipped);
    expect(
      defaultStepParams(plugins.get('rosetta@v1')!, {
        'project.rosetta_dir': 'rosetta',
      }),
    ).toEqual({ working_dir: 'rosetta' });
    // No value for the macro: the parameter is left out, not saved as text.
    expect(defaultStepParams(plugins.get('rosetta@v1')!, {})).toEqual({});
    expect(defaultStepParams(plugins.get('dbt@v1')!)).toEqual({
      command: 'dbt run',
    });
  });

  it('lists each required tool once with the plugins that need it', () => {
    const requirements = collectRequirements(parsePluginManifest(shipped));
    expect(requirements.map((requirement) => requirement.id)).toEqual([
      'git',
      'dbt',
      'rosetta',
      'kisql',
      'aws',
      'terraform',
      'pyspark',
      'java',
    ]);
    expect(
      requirements.find((requirement) => requirement.id === 'java'),
    ).toMatchObject({
      plugins: ['pyspark@v1'],
      check: { command: 'java', args: ['-version'], minVersion: '17' },
      install: { type: 'manual' },
    });

    const shared = collectRequirements(
      parsePluginManifest([
        { name: 'a@v1', requires: [{ id: 'git', check: { command: 'git' } }] },
        { name: 'b@v1', requires: [{ id: 'git', check: { command: 'git' } }] },
      ]),
    );
    expect(shared).toHaveLength(1);
    expect(shared[0].plugins).toEqual(['a@v1', 'b@v1']);
  });
});
