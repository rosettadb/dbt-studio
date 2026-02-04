/* eslint-disable no-console */
import fs from 'fs/promises';
import path from 'path';
import {
  ColumnLineageEdge,
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

import SqlParserService from './sqlParser.service';

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
  compiled_code?: string; // dbt v1.3+
  compiled_sql?: string; // older dbt
  compiled_path?: string; // Check external file if content missing
  raw_code?: string;
  raw_sql?: string;
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
  mtimeMs?: number;
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
      const project = await this.resolveProject(request.projectId);

      const manifest = await this.getManifest(project);
      if (!manifest) {
        console.error(
          '[LineageService] Manifest not loaded for project:',
          project.path,
        );
        return { projectId: project.id, error: 'MANIFEST_NOT_FOUND' };
      }

      if (!request.filePath) {
        return { projectId: project.id };
      }

      const normalized = path.normalize(request.filePath);
      const match = this.findNodeByFilePath(manifest, normalized, project.path);

      if (!match) {
        return {
          projectId: project.id,
          error: 'MODEL_NOT_FOUND',
        };
      }

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

  public static async refreshManifest(projectId: string): Promise<void> {
    const project = await this.resolveProject(projectId);
    this.manifestCache.delete(project.path);
  }

  static async getColumnLineage(
    request: ColumnLineageRequest,
  ): Promise<ColumnLineageResponse> {
    try {
      if (!request.modelId) {
        throw new Error('modelId is required for column lineage');
      }

      const { manifest, rootId } = await this.prepareManifestContext({
        projectId: request.projectId,
        modelId: request.modelId,
        depth: 1, // Depth irrelevant for fetching single node SQL
      });

      const node = manifest.nodes?.[rootId];
      if (!node) {
        throw new Error(`Node ${rootId} not found in manifest`);
      }

      let compiledSql = node.compiled_code ?? node.compiled_sql;

      const project = await this.resolveProject(request.projectId);

      // Fallback: Try reading file from disk
      if (!compiledSql) {
        let absolutePath: string | undefined;

        if (node.compiled_path) {
          // node.compiled_path is relative to project root (e.g. "target/compiled/...")
          absolutePath = path.resolve(project.path, node.compiled_path);
        } else if (node.package_name && node.original_file_path) {
          // Construct path manually: target/compiled/package_name/original_file_path
          absolutePath = path.resolve(
            project.path,
            'target',
            'compiled',
            node.package_name,
            node.original_file_path,
          );
        }

        if (absolutePath) {
          try {
            compiledSql = await fs.readFile(absolutePath, 'utf-8');
          } catch (err) {
            console.warn(
              `[LineageService] Failed to read compiled SQL from ${absolutePath}:`,
              err,
            );
          }
        }
      }

      if (!compiledSql) {
        console.error(
          '[LineageService] Compiled SQL extraction failed for node:',
          node.unique_id,
        );
        // Fallback or error? For accurate lineage, we need compiled SQL.
        throw new Error(
          'Compiled SQL not found. Please run "dbt compile" or "dbt run" to generate compiled code.',
        );
      }

      const dialect = this.resolveSqlDialect(project);
      const parseResult = dialect
        ? await SqlParserService.parseSql(compiledSql, dialect)
        : await SqlParserService.parseSql(compiledSql);

      if (parseResult.error) {
        throw new Error(`SQL Parse Error: ${parseResult.error}`);
      }

      // Convert parse result to ColumnLineageResponse
      // parseResult.columns is { outputCol: [sourceCols...] }
      // We need to map this to ColumnLineageEdge[] format
      //
      // Apply request filters:
      // - selectedColumn: if provided, only return lineage for that specific column
      // - targets: if provided, only return lineage for columns in targets list
      // - showIndirectEdges: if false, exclude indirect edges (currently all are 'direct')
      // - upstreamExpansion: controls upstream table resolution (not fully implemented yet)

      const columnLineage: ColumnLineageEdge[] = [];

      Object.entries(parseResult.columns).forEach(([targetCol, sourceCols]) => {
        // Filter by selectedColumn if provided
        if (
          request.selectedColumn?.name &&
          targetCol.toLowerCase() !== request.selectedColumn.name.toLowerCase()
        ) {
          return; // Skip columns that don't match selectedColumn
        }

        // Filter by targets if provided
        if (request.targets && request.targets.length > 0) {
          const matchesTarget = request.targets.some(
            ([targetTable, targetColName]) =>
              targetTable === rootId &&
              targetColName.toLowerCase() === targetCol.toLowerCase(),
          );
          if (!matchesTarget) {
            return; // Skip columns not in targets list
          }
        }

        sourceCols.forEach((sourceColStr) => {
          const parts = sourceColStr.split('.');
          let colName = sourceColStr;
          let tableName = 'upstream';

          if (parts.length >= 2) {
            colName = parts.pop()!;
            tableName = parts.join('.');
          }

          // Try to resolve tableName to unique_id if possible, or leave as is
          // This is a naive attempt, better logic might be needed
          // For now, we pass the raw table name from SQL.
          // The UI or refined logic handles mapping if needed.

          const edge: ColumnLineageEdge = {
            source: [tableName, colName],
            target: [rootId, targetCol],
            type: 'direct', // All edges from sqlglot are direct
          };

          // Apply showIndirectEdges filter
          if (request.showIndirectEdges === false && edge.type === 'indirect') {
            return; // Skip indirect edges if filter is false
          }

          columnLineage.push(edge);
        });
      });

      return {
        columnLineage,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LineageService] getColumnLineage failed', {
        error,
        request,
      });
      // Return empty response on error so UI doesn't crash? Or rethrow?
      // Rethrowing allows controller to handle.
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
    if (!manifest) {
      throw new Error(
        'Manifest not found. Please run "dbt compile" or "dbt run" first.',
      );
    }
    return {
      manifest,
      rootId: request.modelId,
      depth: request.depth ?? DEFAULT_DEPTH,
    };
  }

  private static async resolveProject(projectId?: string): Promise<Project> {
    if (projectId) {
      // Use loadProjects directly to avoid triggering connection validation/loading
      // which can fail if the connection is missing, but we only need the project path.
      const projects = await ProjectsService.loadProjects();
      const project = projects.find((p) => p.id === projectId);

      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      return project;
    }
    const project = await ProjectsService.getSelectedProject();
    if (!project) {
      throw new Error('No project selected.');
    }
    return project;
  }

  private static async getManifest(
    project: Project,
  ): Promise<ManifestLike | undefined> {
    const manifestPath = path.join(project.path, MANIFEST_FILE);
    let stats;
    try {
      stats = await fs.stat(manifestPath);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        console.warn(
          `[LineageService] Manifest not found at ${manifestPath}. Lineage will be unavailable.`,
        );
        return undefined;
      }
      throw e;
    }

    const cacheHit = this.manifestCache.get(project.path);
    if (cacheHit && cacheHit.mtimeMs && stats.mtimeMs <= cacheHit.mtimeMs) {
      cacheHit.lastAccessed = Date.now();
      return cacheHit.manifest;
    }

    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw) as ManifestLike;
      this.setCache(project, manifest, stats.mtimeMs);

      return manifest;
    } catch (error) {
      console.error(
        `[LineageService] Failed to read manifest at ${manifestPath}`,
        error,
      );
      throw error;
    }
  }

  private static setCache(
    project: Project,
    manifest: ManifestLike,
    mtimeMs: number,
  ) {
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
      mtimeMs,
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
    projectPath: string,
  ): string | undefined {
    // Case-insensitive matching for robustness
    const normalizedTarget = path.normalize(absolutePath).toLowerCase();

    const entries = [
      ...(Object.entries(manifest.nodes ?? {}) as Array<
        [string, ManifestNode]
      >),
      ...(Object.entries(manifest.sources ?? {}) as Array<
        [string, ManifestSource]
      >),
    ];

    // Try exact absolute path match first
    const exactMatch = entries.find(([, value]) => {
      if (!value.original_file_path) {
        return false;
      }
      const entryAbs = path
        .normalize(path.resolve(projectPath, value.original_file_path))
        .toLowerCase();
      return normalizedTarget === entryAbs;
    });

    if (exactMatch) return exactMatch[0];

    // Fallback to relative path suffix match (legacy behavior for compatibility)
    // NOTE: This can produce false positives if paths share common suffixes
    // (e.g., "staging/models/foo.sql" vs "models/foo.sql"). To mitigate this,
    // we ensure the match occurs on a path boundary (preceded by separator or at start).
    return entries.find(([, value]) => {
      if (!value.original_file_path) {
        return false;
      }
      const candidate = path.normalize(value.original_file_path).toLowerCase();

      if (!normalizedTarget.endsWith(candidate)) {
        return false;
      }

      // Ensure match is on a path boundary
      const matchIndex = normalizedTarget.length - candidate.length;
      if (matchIndex === 0) {
        // Match starts at beginning
        return true;
      }

      // Check if preceded by path separator
      const precedingChar = normalizedTarget[matchIndex - 1];
      return (
        precedingChar === path.sep ||
        precedingChar === '/' ||
        precedingChar === '\\'
      );
    })?.[0];
  }

  private static resolveSqlDialect(project: Project): string | undefined {
    const rawAdapter =
      project.dbtConnection?.type ??
      project.connection?.type ??
      project.rosettaConnection?.dbType;

    return this.mapAdapterToSqlParserDialect(rawAdapter);
  }

  private static mapAdapterToSqlParserDialect(
    adapter?: string,
  ): string | undefined {
    if (!adapter) {
      return undefined;
    }

    const normalized = adapter.toLowerCase().trim();

    switch (normalized) {
      case 'snowflake':
        return 'snowflake';
      case 'bigquery':
        return 'bigquery';
      case 'databricks':
        return 'databricks';
      case 'redshift':
        return 'redshift';
      case 'postgres':
      case 'postgresql':
        return 'postgres';
      default:
        return undefined;
    }
  }
}

export default LineageService;
