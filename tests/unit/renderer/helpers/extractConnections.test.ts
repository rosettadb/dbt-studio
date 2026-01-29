import extractConnections from '../../../../src/renderer/helpers/extractConnections';

describe('extractConnections', () => {
  it('should return connections from YAML', () => {
    const yaml = "connections:\n  - name: test\n    type: postgres\n";
    const result = extractConnections(yaml);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ name: 'test', type: 'postgres' }));
  });

  it('should return empty array for invalid yaml', () => {
    const result = extractConnections('not: [valid');
    expect(result).toEqual([]);
  });
});
