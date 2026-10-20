import {
  registerFallbackFileView,
  registerFileView,
  resolveFileView,
  listFileViews,
} from './registry';
import { codeFileView } from './CodeFileView';
import { pipelineFileView } from './PipelineFileView';
import { previewFileView } from './PreviewFileView';

// Registration order is match priority. Adding a file kind = one module
// exporting a FileViewDefinition + one line here.
registerFileView(previewFileView);
registerFileView(pipelineFileView);
registerFallbackFileView(codeFileView);

export { registerFileView, resolveFileView, listFileViews };
export { ActiveFileView } from './ActiveFileView';
export type { FileViewDefinition, FileViewProps } from './types';
