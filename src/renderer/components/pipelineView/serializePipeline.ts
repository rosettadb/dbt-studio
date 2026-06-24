import yaml from 'js-yaml';
import type { Node, Edge } from 'reactflow';
import type { PipelineNodeData } from './PipelineNode';

function topoSort(
  nodes: Node<PipelineNodeData>[],
  edges: Edge[],
): Node<PipelineNodeData>[] {
  const outEdges = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  nodes.forEach((n) => {
    outEdges.set(n.id, []);
    inDegree.set(n.id, 0);
  });
  edges.forEach((e) => {
    outEdges.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  });

  const queue = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
  const result: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    (outEdges.get(id) ?? []).forEach((next) => {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    });
  }

  // Append disconnected nodes sorted by their canvas x position
  const inResult = new Set(result);
  nodes
    .filter((n) => !inResult.has(n.id))
    .sort((a, b) => a.position.x - b.position.x)
    .forEach((n) => result.push(n.id));

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return result.map((id) => nodeMap.get(id)!).filter(Boolean);
}

function stepToObject(data: PipelineNodeData): Record<string, unknown> {
  const step: Record<string, unknown> = {
    name: data.name,
    plugin: data.plugin,
  };
  if (data.plugin === 'git_clone@v1') {
    if (data.url) step.url = data.url;
    if (data.branch) step.branch = data.branch;
    if (data.dest) step.dest = data.dest;
  } else {
    if (data.command) step.command = data.command;
    if (data.working_dir) step.working_dir = data.working_dir;
  }
  return step;
}

export function serializePipelineConfig(
  pipelineName: string,
  nodes: Node<PipelineNodeData>[],
  edges: Edge[],
): string {
  const ordered = topoSort(nodes, edges);

  type JobGroup = {
    name: string;
    type?: string;
    steps: Record<string, unknown>[];
  };
  const jobs: JobGroup[] = [];

  ordered.forEach((node) => {
    const d = node.data;
    const jobName = d.jobName ?? 'run';
    const { jobType } = d;

    const last = jobs[jobs.length - 1];
    if (last && last.name === jobName) {
      last.steps.push(stepToObject(d));
    } else {
      const job: JobGroup = { name: jobName, steps: [stepToObject(d)] };
      if (jobType) job.type = jobType;
      jobs.push(job);
    }
  });

  return yaml.dump({ name: pipelineName, jobs }, { lineWidth: -1, indent: 2 });
}
