export type DbtModelMeta = {
  name: string;
  uniqueId: string;
  packageName?: string;
  description?: string;
  originalFilePath?: string;
};

export type DbtSourceMeta = {
  sourceName: string;
  tableName: string;
  uniqueId: string;
  packageName?: string;
  description?: string;
  originalFilePath?: string;
};

export type DbtMacroMeta = {
  name: string;
  uniqueId: string;
  packageName?: string;
  description?: string;
  originalFilePath?: string;
};

export type DbtDocMeta = {
  name: string;
  uniqueId: string;
  packageName?: string;
  description?: string;
  originalFilePath?: string;
};

export type DbtVariableMeta = { name: string };
export type DbtEnvVarMeta = { name: string };

export type LanguageIntelListModelsResponse = {
  projectId: string;
  models: DbtModelMeta[];
};

export type LanguageIntelListSourcesResponse = {
  projectId: string;
  sources: DbtSourceMeta[];
};

export type LanguageIntelListMacrosResponse = {
  projectId: string;
  macros: DbtMacroMeta[];
};

export type LanguageIntelListDocsResponse = {
  projectId: string;
  docs: DbtDocMeta[];
};

export type LanguageIntelListVariablesResponse = {
  projectId: string;
  variables: DbtVariableMeta[];
};

export type LanguageIntelListEnvVarsResponse = {
  projectId: string;
  envVars: DbtEnvVarMeta[];
};

export type LanguageIntelManifestVersionResponse = {
  projectId: string;
  projectPath: string;
  mtimeMs?: number;
};
