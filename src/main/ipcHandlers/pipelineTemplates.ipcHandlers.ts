import { ipcMain } from 'electron';

const PIPELINE_TEMPLATES_MANIFEST_URL =
  'https://raw.githubusercontent.com/rosettadb/dbt-studio-templates/main/pipelines.json';

export function registerPipelineTemplatesHandlers() {
  // Fetch the public pipeline templates manifest
  ipcMain.handle('pipeline-templates:list', async () => {
    const res = await fetch(PIPELINE_TEMPLATES_MANIFEST_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch pipeline templates: ${res.statusText}`);
    }
    return res.json();
  });

  // Fetch the raw YAML content for a specific template
  ipcMain.handle(
    'pipeline-templates:fetch-content',
    async (event, url: string) => {
      if (!/^https:\/\/raw\.githubusercontent\.com\//.test(url)) {
        throw new Error(
          'Refusing to fetch template content from an untrusted host',
        );
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch template content: ${res.statusText}`);
      }
      return res.text();
    },
  );
}
