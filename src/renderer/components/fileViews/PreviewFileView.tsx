import React from 'react';
import { EditorHeader } from '../editor/editorHeader';
import { MarkdownPreview } from '../editor/markdownPreview';
import { HtmlPreview } from '../editor/htmlPreview';
import { Container, EditorViewport } from '../editor/styles';
import { getPreviewSourcePath } from '../editor/previewConstants';
import { useTabs } from '../../context/TabsProvider';
import type { FileViewDefinition, FileViewProps } from './types';

// Read-only rendering of a markdown/html source. The content comes from the
// live source tab when it is open (so edits preview instantly), otherwise
// from the snapshot captured when the preview was opened.
const PreviewFileView: React.FC<FileViewProps> = ({ tab, project }) => {
  const { tabs, togglePreview, openFile } = useTabs();
  const sourcePath = getPreviewSourcePath(tab.path) ?? tab.path;
  const isHtml = /\.html?$/i.test(sourcePath);

  const content = React.useMemo(() => {
    const sourceTab = tabs.find((t) => t.path === sourcePath);
    return sourceTab?.content ?? tab.content;
  }, [tabs, sourcePath, tab.content]);

  return (
    <Container>
      <EditorHeader
        filePath={sourcePath}
        projectPath={project.path}
        isModified={false}
        isSaving={false}
        hasError={false}
        showDiffButton={false}
        showDiffView={false}
        showPreview
        onSave={() => {}}
        onToggleDiff={() => {}}
        onTogglePreview={() => togglePreview(sourcePath, content)}
        onNavigate={openFile}
      />
      <EditorViewport>
        {isHtml ? (
          <HtmlPreview filePath={sourcePath} />
        ) : (
          <MarkdownPreview content={content} />
        )}
      </EditorViewport>
    </Container>
  );
};

export const previewFileView: FileViewDefinition = {
  id: 'preview',
  matches: (tab) => getPreviewSourcePath(tab.path) !== null,
  Component: PreviewFileView,
};
