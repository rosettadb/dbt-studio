export type LineageNodeType =
  | 'model'
  | 'source'
  | 'snapshot'
  | 'seed'
  | 'analysis'
  | 'exposure'
  | 'metric'
  | 'test'
  | 'macro'
  | string;

export type LineageNode = {
  uniqueId: string;
  name: string;
  label: string;
  resourceType: LineageNodeType;
  packageName?: string;
  description?: string;
  path?: string;
  originalFilePath?: string;
  materialization?: string;
  tags?: string[];
  meta?: Record<string, any>;
  columns?: Record<
    string,
    {
      name: string;
      description?: string;
      meta?: Record<string, any>;
    }
  >;
  tests?: string[];
  upstreamCount: number;
  downstreamCount: number;
  isExternal?: boolean;
};

export type LineageEdgeRelationship = 'upstream' | 'downstream';

export type LineageEdge = {
  source: string;
  target: string;
  relationship: LineageEdgeRelationship;
  depth: number;
};

export type LineageGraphResponse = {
  nodes: LineageNode[];
  edges: LineageEdge[];
};

export type LineageTraversalRequest = {
  modelId: string;
  projectId?: string;
  depth?: number;
};

export type LineageModelMetadata = LineageNode & {
  dependsOn?: {
    nodes?: string[];
    macros?: string[];
  };
  columns?: LineageNode['columns'];
};

export type LineageFullGraphRequest = LineageTraversalRequest;

export type ColumnLineageRequest = {
  projectId?: string;
  targets: [string, string][];
  selectedColumn: { table: string; name: string };
  upstreamExpansion?: boolean;
  showIndirectEdges?: boolean;
};

export type ColumnLineageEdge = {
  source: [string, string];
  target: [string, string];
  type: 'direct' | 'indirect';
};

export type ColumnLineageResponse = {
  columnLineage: ColumnLineageEdge[];
  confidence?: number;
  errors?: Record<string, string[]>;
};

export type LineageSettings = {
  showSelectEdges: boolean;
  showNonSelectEdges: boolean;
  defaultExpansion: number;
};

export type LineageCurrentModelRequest = {
  projectId?: string;
  filePath?: string;
};

export type LineageCurrentModelResponse = {
  projectId?: string;
  modelId?: string;
};
