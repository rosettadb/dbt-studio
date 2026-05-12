import { client } from '../config/client';
import type { Channels } from '../../types/ipc';
import type {
  LanguageIntelManifestVersionResponse,
  LanguageIntelListModelsResponse,
  LanguageIntelListSourcesResponse,
  LanguageIntelListMacrosResponse,
  LanguageIntelListDocsResponse,
  LanguageIntelListVariablesResponse,
  LanguageIntelListEnvVarsResponse,
} from '../../types/languageIntelligence';

type CacheEntry = {
  mtimeMs?: number;
  models?: LanguageIntelListModelsResponse;
  sources?: LanguageIntelListSourcesResponse;
  macros?: LanguageIntelListMacrosResponse;
  docs?: LanguageIntelListDocsResponse;
  variables?: LanguageIntelListVariablesResponse;
  envVars?: LanguageIntelListEnvVarsResponse;
};

const cache = new Map<string, CacheEntry>();
const key = (projectId?: string) => projectId ?? '__selected__';

const fresh = async (projectId?: string): Promise<CacheEntry> => {
  const k = key(projectId);
  const { data: ver } = await client.post<
    string | undefined,
    LanguageIntelManifestVersionResponse
  >('language-intel:manifest:version', projectId);
  const hit = cache.get(k);
  if (hit?.mtimeMs !== ver.mtimeMs) {
    cache.set(k, { mtimeMs: ver.mtimeMs });
  }
  return cache.get(k)!;
};

const post = <T>(channel: Channels, projectId?: string) =>
  client.post<string | undefined, T>(channel, projectId).then((r) => r.data);

export const listModels = async (projectId?: string) => {
  const k = key(projectId);
  const s = await fresh(projectId);
  if (s.models) {
    return s.models;
  }
  const data = await post<LanguageIntelListModelsResponse>(
    'language-intel:models:list',
    projectId,
  );
  cache.set(k, { ...s, models: data });
  return data;
};

export const listSources = async (projectId?: string) => {
  const k = key(projectId);
  const s = await fresh(projectId);
  if (s.sources) {
    return s.sources;
  }
  const data = await post<LanguageIntelListSourcesResponse>(
    'language-intel:sources:list',
    projectId,
  );
  cache.set(k, { ...s, sources: data });
  return data;
};

export const listMacros = async (projectId?: string) => {
  const k = key(projectId);
  const s = await fresh(projectId);
  if (s.macros) return s.macros;
  const data = await post<LanguageIntelListMacrosResponse>(
    'language-intel:macros:list',
    projectId,
  );
  cache.set(k, { ...s, macros: data });
  return data;
};

export const listDocs = async (projectId?: string) => {
  const k = key(projectId);
  const s = await fresh(projectId);
  if (s.docs) return s.docs;
  const data = await post<LanguageIntelListDocsResponse>(
    'language-intel:docs:list',
    projectId,
  );
  cache.set(k, { ...s, docs: data });
  return data;
};

export const listVariables = async (projectId?: string) => {
  const k = key(projectId);
  const s = await fresh(projectId);
  if (s.variables) return s.variables;
  const data = await post<LanguageIntelListVariablesResponse>(
    'language-intel:variables:list',
    projectId,
  );
  cache.set(k, { ...s, variables: data });
  return data;
};

export const listEnvVars = async (projectId?: string) => {
  const k = key(projectId);
  const s = await fresh(projectId);
  if (s.envVars) return s.envVars;
  const data = await post<LanguageIntelListEnvVarsResponse>(
    'language-intel:env-vars:list',
    projectId,
  );
  cache.set(k, { ...s, envVars: data });
  return data;
};
