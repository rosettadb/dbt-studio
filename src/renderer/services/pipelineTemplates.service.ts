export interface RemotePipelineTemplate {
  id: string;
  label: string;
  description: string;
  badge?: string;
  badgeColor?: 'success' | 'warning' | 'primary' | 'info';
  steps: string[];
  fileName: string;
  url: string;
  // 'zip' templates are extracted into the project root; defaults to 'yaml'
  type?: 'yaml' | 'zip';
}

export const listPipelineTemplates = async (): Promise<
  RemotePipelineTemplate[]
> => {
  return window.electron.ipcRenderer.invoke('pipeline-templates:list');
};

export const fetchPipelineTemplateContent = async (
  url: string,
): Promise<string> => {
  return window.electron.ipcRenderer.invoke(
    'pipeline-templates:fetch-content',
    url,
  );
};

export const applyZipTemplate = async (
  projectId: string,
  url: string,
  mode: 'check' | 'replace' | 'skip',
): Promise<string[]> => {
  return window.electron.ipcRenderer.invoke(
    'pipeline-templates:apply-zip',
    projectId,
    url,
    mode,
  );
};
