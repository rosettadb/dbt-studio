import saveConnection from '../../../../src/renderer/helpers/saveConnection';

describe('saveConnection', () => {
  it('should append connection and return yaml string', () => {
    const initialYaml = "connections:\n  - name: existing\n    type: postgres\n";

    const nextYaml = saveConnection(initialYaml, {
      name: 'new',
      type: 'postgres',
    } as any);

    expect(nextYaml).toContain('existing');
    expect(nextYaml).toContain('new');
  });

  it('should return undefined for invalid yaml', () => {
    const nextYaml = saveConnection('not: [valid', { name: 'x' } as any);
    expect(nextYaml).toBeUndefined();
  });
});
