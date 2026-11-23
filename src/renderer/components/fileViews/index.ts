import {
  fileViewRegistry,
  registerFallbackFileView,
  registerFileView,
  resolveFileView,
  listFileViews,
} from './registry';
import { codeFileView } from './CodeFileView';
import { previewFileView } from './PreviewFileView';
import { chartsFileView } from './ChartsFileView';

// Each view's `priority` decides who wins when several match. Adding a
// file kind = one module exporting a FileViewDefinition + one line here.
// The pipeline view is registered by the pipeline tool itself.
registerFileView(previewFileView);
registerFileView(chartsFileView);
registerFallbackFileView(codeFileView);

export { fileViewRegistry, registerFileView, resolveFileView, listFileViews };
export { ActiveFileView } from './ActiveFileView';
export type { FileViewDefinition, FileViewProps } from './types';
