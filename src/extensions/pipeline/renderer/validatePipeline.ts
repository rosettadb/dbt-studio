import type { Node, Edge } from 'reactflow';
import type { PipelineNodeData } from './PipelineNode';
import {
  validateStepParams,
  type PluginDefinition,
} from '../shared/pipelineShared';

export interface ValidationError {
  nodeId?: string;
  message: string;
}

export function validatePipelineGraph(
  nodes: Node<PipelineNodeData>[],
  edges: Edge[],
  pluginsById: ReadonlyMap<string, PluginDefinition> = new Map(),
): ValidationError[] {
  if (nodes.length === 0) {
    return [{ message: 'Pipeline has no steps' }];
  }

  const errors: ValidationError[] = [];

  // Cycle detection via Kahn's algorithm
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
  });
  const nodeIds = new Set(nodes.map((n) => n.id));
  edges.forEach((e) => {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return;
    outEdges.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  });

  const queue = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
  let visited = 0;
  const q = [...queue];
  while (q.length > 0) {
    const id = q.shift()!;
    visited += 1;
    (outEdges.get(id) ?? []).forEach((next) => {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) q.push(next);
    });
  }
  if (visited < nodes.length) {
    errors.push({
      message: 'Pipeline contains a cycle — remove the circular connection',
    });
  }

  // What each step's plugin asks for in the runner's plugin manifest. A
  // plugin the manifest does not list is not checked here.
  nodes.forEach((n) => {
    const { name, plugin } = n.data;
    if (!name?.trim()) {
      errors.push({ nodeId: n.id, message: 'A step is missing its name' });
    }
    const def = pluginsById.get(plugin);
    if (def) {
      validateStepParams(def, n.data.params ?? {}).forEach((issue) => {
        errors.push({
          nodeId: n.id,
          message: issue.key
            ? `"${name || 'Step'}" is ${issue.message}`
            : `"${name || 'Step'}": ${issue.message}`,
        });
      });
    }
  });

  return errors;
}
