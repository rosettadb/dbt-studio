import yaml from 'js-yaml';
import type { Node, Edge } from 'reactflow';
import { parsePipelineConfig } from '../../../../src/extensions/pipeline/renderer/parsePipelineConfig';
import { serializePipelineConfig } from '../../../../src/extensions/pipeline/renderer/serializePipeline';
import { validatePipelineGraph } from '../../../../src/extensions/pipeline/renderer/validatePipeline';
import type { PipelineNodeData } from '../../../../src/extensions/pipeline/renderer/PipelineNode';
import { parsePluginManifest } from '../../../../src/shared/pluginManifest';
import shipped from '../../__fixtures__/plugins.json';

const PIPELINE = `name: graph
jobs:
  - name: prepare
    steps:
      - name: Write marker
        plugin: command@v1
        command: echo prepared
        custom_option: kept
        retries: 3
        verbose: true
  - name: build
    needs: [prepare]
    timeout: 10
    steps:
      - name: Spark
        plugin: pyspark@v1
        script: jobs/etl.py
        args: --date 2024-01-01
      - name: Future
        plugin: future@v9
        anything: [1, 2]
  - name: teardown
    type: cleanup
    steps:
      - name: Cleanup
        plugin: command@v1
        command: echo cleanup
`;

// What PipelineGraph does with a parsed pipeline: one node per step, linked
// in file order.
const toGraph = (content: string) => {
  const config = parsePipelineConfig(content)!;
  const nodes: Node<PipelineNodeData>[] = [];
  const edges: Edge[] = [];
  config.jobs.forEach((job, jobIndex) => {
    job.steps.forEach((step, stepIndex) => {
      const id = `${jobIndex}-${stepIndex}`;
      if (nodes.length > 0) {
        const previous = nodes[nodes.length - 1].id;
        edges.push({ id: `e-${previous}-${id}`, source: previous, target: id });
      }
      nodes.push({
        id,
        type: 'pipelineNode',
        position: { x: 0, y: 0 },
        data: {
          ...step,
          stepIndex,
          jobName: job.name,
          jobType: job.type,
          jobExtra: job.extra,
        },
      });
    });
  });
  return { config, nodes, edges };
};

describe('pipeline designer round trip', () => {
  it('keeps every step and job key through a visual save', () => {
    const { config, nodes, edges } = toGraph(PIPELINE);
    expect(config.jobs[0].steps[0]).toEqual({
      name: 'Write marker',
      plugin: 'command@v1',
      params: {
        command: 'echo prepared',
        custom_option: 'kept',
        retries: 3,
        verbose: true,
      },
    });
    expect(config.jobs[1].extra).toEqual({ needs: ['prepare'], timeout: 10 });

    const saved = serializePipelineConfig(config.name, nodes, edges);
    expect(yaml.load(saved)).toEqual(yaml.load(PIPELINE));
  });

  it('leaves out empty parameters but keeps false and 0', () => {
    const { nodes, edges } = toGraph(PIPELINE);
    nodes[0].data.params = {
      command: 'echo x',
      working_dir: '',
      verbose: false,
      retries: 0,
      gone: undefined,
    };
    const saved = yaml.load(serializePipelineConfig('graph', nodes, edges)) as {
      jobs: { steps: Record<string, unknown>[] }[];
    };
    expect(saved.jobs[0].steps[0]).toEqual({
      name: 'Write marker',
      plugin: 'command@v1',
      command: 'echo x',
      verbose: false,
      retries: 0,
    });
  });

  it('still rejects a file that is not a pipeline', () => {
    expect(parsePipelineConfig('name: x\njobs: nope\n')).toBeNull();
    expect(
      parsePipelineConfig(
        'name: x\njobs:\n  - name: j\n    steps:\n      - name: s\n',
      ),
    ).toBeNull();
    expect(parsePipelineConfig(': : :')).toBeNull();
  });

  it('validates steps against the plugin manifest', () => {
    const pluginsById = new Map(
      parsePluginManifest(shipped).map((plugin) => [plugin.id, plugin]),
    );
    const { nodes, edges } = toGraph(PIPELINE);
    expect(validatePipelineGraph(nodes, edges, pluginsById)).toEqual([]);

    nodes[0].data.params = {};
    nodes[1].data.params = { args: '--x' };
    expect(
      validatePipelineGraph(nodes, edges, pluginsById).map(
        (error) => error.message,
      ),
    ).toEqual([
      '"Write marker" is missing required field: Command',
      '"Spark": Provide a script or a command.',
    ]);
    // A plugin the manifest does not list (future@v9) is not checked.
    expect(validatePipelineGraph(nodes, edges, new Map())).toEqual([]);
  });
});
