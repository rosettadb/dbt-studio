/* eslint-disable no-console */
import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import LineageService from './lineage.service';
import type { Project } from '../../types/backend';
import type {
  DbtModelMeta,
  DbtSourceMeta,
  DbtMacroMeta,
  DbtDocMeta,
  LanguageIntelListModelsResponse,
  LanguageIntelListSourcesResponse,
  LanguageIntelListMacrosResponse,
  LanguageIntelListDocsResponse,
  LanguageIntelListVariablesResponse,
  LanguageIntelListEnvVarsResponse,
  LanguageIntelManifestVersionResponse,
} from '../../types/languageIntelligence';

type ProjectIndex = {
  project: Project;
  mtimeMs?: number;
  modelsByName: Map<string, DbtModelMeta>;
  sourcesByKey: Map<string, DbtSourceMeta>;
  macrosByName: Map<string, DbtMacroMeta>;
  docsByName: Map<string, DbtDocMeta>;
};

const MANIFEST_FILE = path.join('target', 'manifest.json');

class LanguageIntelligenceService {
  private static indexCache: Map<string, ProjectIndex> = new Map();

  private static async getIndex(projectId?: string): Promise<ProjectIndex> {
    const project = await LineageService.resolveProject(projectId);
    const manifestPath = path.join(project.path, MANIFEST_FILE);

    let mtimeMs: number | undefined;
    try {
      const stats = await fs.stat(manifestPath);
      mtimeMs = stats.mtimeMs;
      const hit = this.indexCache.get(project.path);
      if (hit && hit.mtimeMs && mtimeMs && hit.mtimeMs >= mtimeMs) {
        return hit;
      }
    } catch {
      // stat failed, means no manifest
    }

    const manifest = await LineageService.getManifest(project);
    if (!manifest) {
      console.warn(
        `[LangIntel] getManifest returned null/undefined for project ${project.name}`,
      );
      return {
        project,
        mtimeMs: undefined,
        modelsByName: new Map(),
        sourcesByKey: new Map(),
        macrosByName: new Map(),
        docsByName: new Map(),
      };
    }

    const modelsByName = new Map<string, DbtModelMeta>();
    const sourcesByKey = new Map<string, DbtSourceMeta>();
    const macrosByName = new Map<string, DbtMacroMeta>();
    const docsByName = new Map<string, DbtDocMeta>();

    Object.entries(manifest.nodes ?? {}).forEach(([uid, node]) => {
      const rt = node.resource_type ?? uid.split('.')[0];
      if (rt !== 'model' || !node.name) return;
      modelsByName.set(node.name, {
        name: node.name,
        uniqueId: uid,
        packageName: node.package_name,
        description: node.description,
        originalFilePath: node.original_file_path,
      });
    });

    Object.entries(manifest.sources ?? {}).forEach(([uid, src]) => {
      if (!src.source_name || !src.name) return;
      const key = `${src.source_name}.${src.name}`;
      sourcesByKey.set(key, {
        sourceName: src.source_name,
        tableName: src.name,
        uniqueId: uid,
        packageName: src.package_name,
        description: src.description,
        originalFilePath: src.original_file_path,
      });
    });

    Object.entries(manifest.macros ?? {}).forEach(([uid, m]) => {
      if (!m.name) return;
      macrosByName.set(m.name, {
        name: m.name,
        uniqueId: uid,
        packageName: m.package_name,
        description: m.description,
        originalFilePath: m.original_file_path,
      });
    });

    Object.entries(manifest.docs ?? {}).forEach(([uid, d]: [string, any]) => {
      if (!d.name) return;
      docsByName.set(d.name, {
        name: d.name,
        uniqueId: uid,
        packageName: d.package_name,
        description: d.description,
        originalFilePath: d.original_file_path,
      });
    });

    const next: ProjectIndex = {
      project,
      mtimeMs,
      modelsByName,
      sourcesByKey,
      macrosByName,
      docsByName,
    };
    this.indexCache.set(project.path, next);
    return next;
  }

  static async getManifestVersion(
    projectId?: string,
  ): Promise<LanguageIntelManifestVersionResponse> {
    const project = await LineageService.resolveProject(projectId);
    const manifestPath = path.join(project.path, MANIFEST_FILE);
    try {
      const stats = await fs.stat(manifestPath);
      return {
        projectId: project.id,
        projectPath: project.path,
        mtimeMs: stats.mtimeMs,
      };
    } catch {
      return { projectId: project.id, projectPath: project.path };
    }
  }

  static async listModels(
    projectId?: string,
  ): Promise<LanguageIntelListModelsResponse> {
    const idx = await this.getIndex(projectId);
    return {
      projectId: idx.project.id,
      models: [...idx.modelsByName.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }

  static async listSources(
    projectId?: string,
  ): Promise<LanguageIntelListSourcesResponse> {
    const idx = await this.getIndex(projectId);
    return {
      projectId: idx.project.id,
      sources: [...idx.sourcesByKey.values()].sort((a, b) =>
        `${a.sourceName}.${a.tableName}`.localeCompare(
          `${b.sourceName}.${b.tableName}`,
        ),
      ),
    };
  }

  static async listMacros(
    projectId?: string,
  ): Promise<LanguageIntelListMacrosResponse> {
    const idx = await this.getIndex(projectId);
    return {
      projectId: idx.project.id,
      macros: [...idx.macrosByName.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }

  static async listDocs(
    projectId?: string,
  ): Promise<LanguageIntelListDocsResponse> {
    const idx = await this.getIndex(projectId);
    return {
      projectId: idx.project.id,
      docs: [...idx.docsByName.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }

  static async listVariables(
    projectId?: string,
  ): Promise<LanguageIntelListVariablesResponse> {
    const project = await LineageService.resolveProject(projectId);
    try {
      const content = await fs.readFile(
        path.join(project.path, 'dbt_project.yml'),
        'utf-8',
      );
      const parsed = yaml.load(content) as any;
      const keys =
        parsed?.vars && typeof parsed.vars === 'object'
          ? Object.keys(parsed.vars)
          : [];
      return {
        projectId: project.id,
        variables: keys.sort().map((name) => ({ name })),
      };
    } catch {
      return { projectId: project.id, variables: [] };
    }
  }

  static async listEnvVars(
    projectId?: string,
  ): Promise<LanguageIntelListEnvVarsResponse> {
    const project = await LineageService.resolveProject(projectId);
    try {
      const content = await fs.readFile(
        path.join(project.path, '.env'),
        'utf-8',
      );
      const keys = [
        ...new Set(
          content
            .split('\n')
            .map((l) => l.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
            .filter((k): k is string => Boolean(k)),
        ),
      ].sort();
      return {
        projectId: project.id,
        envVars: keys.map((name) => ({ name })),
      };
    } catch {
      return { projectId: project.id, envVars: [] };
    }
  }
}

export default LanguageIntelligenceService;
