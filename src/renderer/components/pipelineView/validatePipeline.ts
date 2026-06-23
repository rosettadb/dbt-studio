import type { Node, Edge } from 'reactflow';
import type { PipelineNodeData } from './PipelineNode';
import { PLUGIN_MAP } from './pluginDefinitions';

export interface ValidationError {
  nodeId?: string;
  message: string;
}

export function validatePipelineGraph(
  nodes: Node<PipelineNodeData>[],
  edges: Edge[],
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
  edges.forEach((e) => {
    outEdges.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  });

  const queue = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
  let visited = 0;
  const q = [...queue];
  while (q.length > 0) {
    const id = q.shift()!;
    visited++;
    for (const next of outEdges.get(id) ?? []) {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) q.push(next);
    }
  }
  if (visited < nodes.length) {
    errors.push({ message: 'Pipeline contains a cycle — remove the circular connection' });
  }

  // Required fields per plugin
  nodes.forEach((n) => {
    const { name, plugin } = n.data;
    if (!name?.trim()) {
      errors.push({ nodeId: n.id, message: 'A step is missing its name' });
    }
    const def = PLUGIN_MAP.get(plugin);
    if (def) {
      def.fields
        .filter((f) => f.required)
        .forEach((f) => {
          const val = (n.data as unknown as Record<string, unknown>)[f.key];
          if (!val || (typeof val === 'string' && !val.trim())) {
            errors.push({
              nodeId: n.id,
              message: `"${name || 'Step'}" is missing required field: ${f.label}`,
            });
          }
        });
    }
  });

  return errors;
}
