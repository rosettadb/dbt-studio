/* eslint-disable no-console */
import fs from 'fs/promises';
import path from 'path';
import {
  ColumnLineageRequest,
  ColumnLineageResponse,
  LineageCurrentModelRequest,
  LineageCurrentModelResponse,
  LineageEdge,
  LineageFullGraphRequest,
  LineageGraphResponse,
  LineageModelMetadata,
  LineageNode,
  LineageTraversalRequest,
} from '../../types/lineage';
import type { Project } from '../../types/backend';
import ProjectsService from './projects.service';

type ManifestColumn = {
  name: string;
  description?: string;
  meta?: Record<string, any>;
  data_type?: string;
};

type ManifestNode = {
  unique_id: string;
  name?: string;
  alias?: string;
  description?: string;
  resource_type?: string;
  package_name?: string;
  path?: string;
  original_file_path?: string;
  patch_path?: string;
  depends_on?: { nodes?: string[]; macros?: string[] };
  columns?: Record<string, ManifestColumn>;
  config?: { materialized?: string };
  tags?: string[];
  meta?: Record<string, any>;
  is_external?: boolean;
};

type ManifestSource = {
  unique_id: string;
  name?: string;
  source_name?: string;
  description?: string;
  resource_type?: string;
  package_name?: string;
  path?: string;
  original_file_path?: string;
  patch_path?: string;
  columns?: Record<string, ManifestColumn>;
  tags?: string[];
  meta?: Record<string, any>;
  relationship?: string;
  config?: { materialized?: string };
};

type ManifestLike = {
  nodes?: Record<string, ManifestNode>;
  sources?: Record<string, ManifestSource>;
  macros?: Record<string, ManifestNode>;
  exposures?: Record<string, ManifestNode>;
  metrics?: Record<string, ManifestNode>;
  child_map?: Record<string, string[]>;
  parent_map?: Record<string, string[]>;
};

type ManifestCacheEntry = {
  manifest: ManifestLike;
  project: Project;
  lastAccessed: number;
};

const DEFAULT_DEPTH = 1;
const MANIFEST_FILE = path.join('target', 'manifest.json');
const MAX_CACHE_SIZE = 5;

class LineageService {
  private static manifestCache: Map<string, ManifestCacheEntry> = new Map();

  static invalidateProject(projectPath: string) {
    this.manifestCache.delete(projectPath);
  }

  static async getUpstreamModels(
    request: LineageTraversalRequest,
  ): Promise<LineageGraphResponse> {
    try {
      const { manifest, rootId, depth } =
        await this.prepareManifestContext(request);
      return this.buildGraph(manifest, rootId, 'upstream', depth);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LineageService] getUpstreamModels failed', error);
      throw error;
    }
  }

  static async getDownstreamModels(
    request: LineageTraversalRequest,
  ): Promise<LineageGraphResponse> {
    try {
      const { manifest, rootId, depth } =
        await this.prepareManifestContext(request);
      return this.buildGraph(manifest, rootId, 'downstream', depth);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LineageService] getDownstreamModels failed', error);
      throw error;
    }
  }

  static async getFullLineage(
    request: LineageFullGraphRequest,
  ): Promise<LineageGraphResponse> {
    try {
      const { manifest, rootId, depth } =
        await this.prepareManifestContext(request);
      const upstream = this.buildGraph(manifest, rootId, 'upstream', depth);
      const downstream = this.buildGraph(manifest, rootId, 'downstream', depth);

      const nodesMap = new Map<string, LineageNode>();
      [...upstream.nodes, ...downstream.nodes].forEach((node) =>
        nodesMap.set(node.uniqueId, node),
      );

      const edges = [...upstream.edges];
      downstream.edges.forEach((edge) => {
        const signature = this.edgeSignature(edge);
        const alreadyExists = edges.find(
          (existing) => this.edgeSignature(existing) === signature,
        );
        if (!alreadyExists) {
          edges.push(edge);
        }
      });

      return {
        nodes: Array.from(nodesMap.values()),
        edges,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LineageService] getFullLineage failed', error);
      throw error;
    }
  }

  static async getModelMetadata(
    request: LineageTraversalRequest,
  ): Promise<LineageModelMetadata | undefined> {
    try {
      const { manifest, rootId } = await this.prepareManifestContext(request);
      const manifestNode = this.lookupManifestEntity(manifest, rootId);
      if (!manifestNode) {
        return undefined;
      }
      const baseNode = this.transformManifestNode(
        manifest,
        rootId,
        manifestNode,
      );
      return {
        ...baseNode,
        dependsOn:
          'depends_on' in manifestNode ? manifestNode.depends_on : undefined,
        columns: manifestNode.columns as LineageNode['columns'],
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LineageService] getModelMetadata failed', error);
      throw error;
    }
  }

  static async getCurrentModelId(
    request: LineageCurrentModelRequest,
  ): Promise<LineageCurrentModelResponse> {
    try {
      console.log('[LineageService] getCurrentModelId request:', request);
      const project = await this.resolveProject(request.projectId);
      console.log('[LineageService] Resolved project:', project.path);

      const manifest = await this.getManifest(project);
      if (!manifest) {
        console.error(
          '[LineageService] Manifest not loaded for project:',
          project.path,
        );
        return { projectId: project.id };
      }

      if (!request.filePath) {
        return { projectId: project.id };
      }

      const normalized = path.normalize(request.filePath);
      const match = this.findNodeByFilePath(manifest, normalized);

      console.log(
        '[LineageService] Found modelId:',
        match,
        'for file:',
        normalized,
      );

      return {
        projectId: project.id,
        modelId: match,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LineageService] getCurrentModelId failed', error);
      throw error;
    }
  }

  static async getColumnLineage(
    request: ColumnLineageRequest,
  ): Promise<ColumnLineageResponse> {
    try {
      throw new Error('Column lineage support is not implemented yet.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LineageService] getColumnLineage failed', {
        error,
        request,
      });
      throw error;
    }
  }

  private static edgeSignature(edge: LineageEdge) {
    return `${edge.source}->${edge.target}:${edge.relationship}:${edge.depth}`;
  }

  private static async prepareManifestContext(
    request: LineageTraversalRequest,
  ) {
    if (!request.modelId) {
      throw new Error('modelId is required for lineage requests.');
    }
    const project = await this.resolveProject(request.projectId);
    const manifest = await this.getManifest(project);
    return {
      manifest,
      rootId: request.modelId,
      depth: request.depth ?? DEFAULT_DEPTH,
    };
  }

  private static async resolveProject(projectId?: string): Promise<Project> {
    if (projectId) {
      const project = await ProjectsService.getProject(projectId);
      if (project) {
        return project;
      }
    }
    const selected = await ProjectsService.getSelectedProject();
    if (!selected) {
      throw new Error('No active project found for lineage request.');
    }
    return selected;
  }

  private static async getManifest(project: Project): Promise<ManifestLike> {
    const cacheHit = this.manifestCache.get(project.path);
    if (cacheHit) {
      cacheHit.lastAccessed = Date.now();
      return cacheHit.manifest;
    }
    const manifestPath = path.join(project.path, MANIFEST_FILE);
    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw) as ManifestLike;
      this.setCache(project, manifest);
      return manifest;
    } catch (error) {
      console.error(
        `[LineageService] Failed to read manifest at ${manifestPath}`,
        error,
      );
      throw error;
    }
  }

  private static setCache(project: Project, manifest: ManifestLike) {
    if (this.manifestCache.size >= MAX_CACHE_SIZE) {
      const oldest = [...this.manifestCache.entries()].sort(
        (a, b) => a[1].lastAccessed - b[1].lastAccessed,
      )[0];
      if (oldest) {
        this.manifestCache.delete(oldest[0]);
      }
    }
    this.manifestCache.set(project.path, {
      manifest,
      project,
      lastAccessed: Date.now(),
    });
  }

  private static buildGraph(
    manifest: ManifestLike,
    rootId: string,
    direction: 'upstream' | 'downstream',
    maxDepth: number,
  ): LineageGraphResponse {
    const adjacency =
      direction === 'upstream' ? manifest.parent_map : manifest.child_map;
    if (!adjacency) {
      console.warn(
        `[LineageService] No adjacency map found for direction: ${direction}`,
      );
      return { nodes: [], edges: [] };
    }
    const nodes = new Map<string, LineageNode>();
    const edges: LineageEdge[] = [];
    const queue: Array<{ id: string; depth: number }> = [
      { id: rootId, depth: 0 },
    ];
    const visited = new Map<string, number>([[rootId, 0]]);

    console.log(
      `[LineageService] Building ${direction} graph for ${rootId}, maxDepth: ${maxDepth}`,
    );

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      const manifestNode = this.lookupManifestEntity(manifest, id);
      if (manifestNode) {
        nodes.set(id, this.transformManifestNode(manifest, id, manifestNode));
      } else {
        console.warn(`[LineageService] Node not found in manifest: ${id}`);
      }
      if (depth < maxDepth) {
        const neighbors = adjacency[id] ?? [];
        neighbors.forEach((neighborId) => {
          const nextDepth = depth + 1;
          if (
            !visited.has(neighborId) ||
            (visited.get(neighborId) ?? Infinity) > nextDepth
          ) {
            visited.set(neighborId, nextDepth);
            queue.push({ id: neighborId, depth: nextDepth });
          }
          edges.push(this.buildEdge(direction, id, neighborId, nextDepth));
        });
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
    };
  }

  private static buildEdge(
    direction: 'upstream' | 'downstream',
    sourceId: string,
    neighborId: string,
    depth: number,
  ): LineageEdge {
    if (direction === 'downstream') {
      return {
        source: sourceId,
        target: neighborId,
        relationship: 'downstream',
        depth,
      };
    }
    return {
      source: neighborId,
      target: sourceId,
      relationship: 'upstream',
      depth,
    };
  }

  private static lookupManifestEntity(
    manifest: ManifestLike,
    uniqueId: string,
  ): ManifestNode | ManifestSource | undefined {
    return (
      manifest.nodes?.[uniqueId] ||
      manifest.sources?.[uniqueId] ||
      manifest.exposures?.[uniqueId] ||
      manifest.metrics?.[uniqueId] ||
      manifest.macros?.[uniqueId]
    );
  }

  private static transformManifestNode(
    manifest: ManifestLike,
    uniqueId: string,
    manifestNode: ManifestNode | ManifestSource,
  ): LineageNode {
    const alias = 'alias' in manifestNode ? manifestNode.alias : undefined;
    const resourceType =
      manifestNode.resource_type ?? uniqueId.split('.')[0] ?? 'model';
    const upstreamCount = manifest.parent_map?.[uniqueId]?.length ?? 0;
    const downstreamCount = manifest.child_map?.[uniqueId]?.length ?? 0;
    return {
      uniqueId,
      name: manifestNode.name ?? alias ?? uniqueId,
      label: alias ?? manifestNode.name ?? uniqueId,
      resourceType,
      packageName: manifestNode.package_name,
      description: manifestNode.description,
      path: manifestNode.path,
      originalFilePath: manifestNode.original_file_path,
      materialization:
        (manifestNode as ManifestNode).config?.materialized ??
        manifestNode.config?.materialized,
      tags: manifestNode.tags,
      meta: manifestNode.meta,
      columns: manifestNode.columns as LineageNode['columns'],
      tests: [],
      upstreamCount,
      downstreamCount,
      isExternal: (manifestNode as ManifestNode).is_external ?? false,
    };
  }

  private static findNodeByFilePath(
    manifest: ManifestLike,
    absolutePath: string,
  ): string | undefined {
    // Case-insensitive matching for robustness
    const normalized = path.normalize(absolutePath).toLowerCase();

    const entries = [
      ...(Object.entries(manifest.nodes ?? {}) as Array<
        [string, ManifestNode]
      >),
      ...(Object.entries(manifest.sources ?? {}) as Array<
        [string, ManifestSource]
      >),
    ];

    return entries.find(([, value]) => {
      if (!value.original_file_path) {
        return false;
      }
      const candidate = path.normalize(value.original_file_path).toLowerCase();
      return normalized.endsWith(candidate);
    })?.[0];
  }
}

export default LineageService;
