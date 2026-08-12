import {
  ADDABLE_PIPELINE_PLUGINS,
  PIPELINE_PLUGIN_CATALOG,
} from '../../../src/shared/pipelinePluginCatalog';
import { PLUGIN_DEFS } from '../../../src/renderer/components/pipelineView/pluginDefinitions';

describe('pipeline plugin authoring catalog', () => {
  it('defines six unique addable plugins with required fields', () => {
    expect(ADDABLE_PIPELINE_PLUGINS.map((plugin) => plugin.id)).toEqual([
      'dbt@v1',
      'rosetta@v1',
      'terraform@v1',
      'command@v1',
      's3@v1',
      'kinetica_cli@v1',
    ]);
    expect(
      new Set(PIPELINE_PLUGIN_CATALOG.map((plugin) => plugin.id)).size,
    ).toBe(PIPELINE_PLUGIN_CATALOG.length);
    ADDABLE_PIPELINE_PLUGINS.forEach((plugin) => {
      expect(plugin.fields.some((field) => field.required)).toBe(true);
      expect(() => JSON.stringify(plugin)).not.toThrow();
    });
  });

  it('keeps git clone compatibility-only', () => {
    expect(
      PIPELINE_PLUGIN_CATALOG.find((plugin) => plugin.id === 'git_clone@v1'),
    ).toMatchObject({
      availability: 'preserve-only',
      fields: expect.arrayContaining([
        expect.objectContaining({ key: 'url', required: true }),
      ]),
    });
  });

  it('keeps the visual palette in parity with addable contracts', () => {
    expect(PLUGIN_DEFS.map((plugin) => plugin.id)).toEqual(
      ADDABLE_PIPELINE_PLUGINS.map((plugin) => plugin.id),
    );
    PLUGIN_DEFS.forEach((definition) => {
      const contract = ADDABLE_PIPELINE_PLUGINS.find(
        (plugin) => plugin.id === definition.id,
      );
      expect(definition.fields).toEqual(contract?.fields);
    });
  });
});
