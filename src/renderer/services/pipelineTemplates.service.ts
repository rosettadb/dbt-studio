export interface RemotePipelineTemplate {
  id: string;
  label: string;
  description: string;
  badge?: string;
  badgeColor?: 'success' | 'warning' | 'primary' | 'info';
  steps: string[];
  fileName: string;
  url: string;
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
