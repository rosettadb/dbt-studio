import React from 'react';
import { OnChange, loader } from '@monaco-editor/react';
import { Box, useTheme } from '@mui/material';
import {
  useGetFileDiff,
  useGetFileStatus,
  useGitIsInitialized,
  useSaveFileContent,
} from '../../controllers';
import { DiffView } from './diffView';
import { CodeEditor } from './codeEditor';
import { EditorHeader } from './editorHeader';
import { UnsavedChangesDialog } from './unsavedChangesDialog';
import { getLanguageFromExtension, getVersionsFromDiff } from './helpers';
import { Container, EditorViewport } from './styles';
import { PipelineView, isPipelineFile } from '../pipelineView';
import type {
  EditorTabId,
  EditorTabState,
  PendingCloseState,
} from '../../../types/editor';

type EditorProps = {
  projectPath: string;
  tabs: EditorTabState[];
  activeTabId: EditorTabId | null;
  onTabContentChange: (tabId: EditorTabId, content: string) => void;
  onTabSaved?: (tabId: EditorTabId) => void;
  onTabError?: (tabId: EditorTabId, error?: string) => void;
  pendingClose: PendingCloseState | null;
  onSaveAndClose: (tabId: EditorTabId) => Promise<void>;
  onDiscardAndClose: (tabId: EditorTabId) => void;
  onCancelClose: () => void;
  onGitStatusRefresh?: () => void;
};

export const Editor: React.FC<EditorProps> = ({
  projectPath,
  tabs,
  activeTabId,
  onTabContentChange,
  onTabSaved,
  onTabError,
  pendingClose,
  onSaveAndClose,
  onDiscardAndClose,
  onCancelClose,
  onGitStatusRefresh,
}) => {
  loader.config({
    paths: {
      vs: 'app-asset://zui/node_modules/monaco-editor/min/vs',
    },
  });
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [tabs, activeTabId],
  );

  const activeFilePath = activeTab?.path ?? '';
  const activeContent = activeTab?.content ?? '';
  const { data: isInitialized } = useGitIsInitialized(projectPath, {
    enabled: Boolean(projectPath),
  });

  const { data: fileStatus, isLoading: isLoadingFileStatus } = useGetFileStatus(
    projectPath,
    activeFilePath,
    {
      refetchInterval: 20000,
      enabled: Boolean(isInitialized && activeFilePath),
    },
  );
  const { data: fileDiff } = useGetFileDiff(projectPath, activeFilePath, {
    enabled: Boolean(activeFilePath && isInitialized && projectPath),
  });
  const { mutate: updateFileContent } = useSaveFileContent();
  const theme = useTheme();
  const monacoTheme = theme.palette.mode === 'dark' ? 'vs-dark' : 'light';
  const language = getLanguageFromExtension(activeFilePath || 'txt');

  const isFileEditable = !activeTab?.isReadOnly;
  const [showDiffView, setShowDiffView] = React.useState(false);
  const [showPipelinePreview, setShowPipelinePreview] = React.useState(false);
  const [splitPercent, setSplitPercent] = React.useState(50);
  const [isSaving, setIsSaving] = React.useState(false);

  const isPipeline = isPipelineFile(activeFilePath);
  const showSplit = isPipeline && showPipelinePreview;

  // Resize handle logic — tracks delta from mousedown position
  const containerRef = React.useRef<HTMLDivElement>(null);
  const handleResizeStart = React.useCallback(
    (startX: number) => {
      const containerWidth = containerRef.current?.offsetWidth ?? 1;
      const startPercent = splitPercent;

      const onMove = (e: MouseEvent) => {
        const delta = e.clientX - startX;
        const next = startPercent + (delta / containerWidth) * 100;
        setSplitPercent(Math.max(20, Math.min(80, next)));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [splitPercent],
  );

  const originalContent = React.useMemo(() => {
    if (!activeTab) {
      return null;
    }
    if (fileStatus?.status === 'untracked' || !fileStatus?.status) {
      return null;
    }

    const { oldVersion } = getVersionsFromDiff(
      activeContent,
      String(fileDiff?.diff),
    );
    return oldVersion;
  }, [fileStatus, fileDiff, activeContent, activeTab]);

  React.useEffect(() => {
    setShowDiffView(false);
    // Auto-open the preview panel when switching to a pipeline file
    setShowPipelinePreview(isPipelineFile(activeFilePath));
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = React.useCallback(() => {
    if (!activeTab || !activeTabId || !activeTab.isModified || isSaving) {
      return;
    }

    setIsSaving(true);

    updateFileContent(
      { path: activeTab.path, content: activeTab.content },
      {
        onSuccess: () => {
          onTabSaved?.(activeTabId);
          onTabError?.(activeTabId, undefined);
          setIsSaving(false);
          onGitStatusRefresh?.();
        },
        onError: (error) => {
          onTabError?.(activeTabId, error?.message);
          setIsSaving(false);
        },
      },
    );
  }, [
    activeTab,
    activeTabId,
    isSaving,
    updateFileContent,
    onTabSaved,
    onTabError,
    onGitStatusRefresh,
  ]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const activeTabIdRef = React.useRef(activeTabId);
  const expectedContentRef = React.useRef(activeContent);

  activeTabIdRef.current = activeTabId;
  expectedContentRef.current = activeContent;

  const handleChange: OnChange = React.useCallback(
    (value) => {
      if (value === undefined) {
        return;
      }

      const currentTabId = activeTabIdRef.current;
      if (!currentTabId) {
        return;
      }

      const expectedContent = expectedContentRef.current;

      if (value === expectedContent) {
        return;
      }

      onTabContentChange(currentTabId, value);
    },
    [onTabContentChange],
  );

  if (tabs.length === 0) {
    return (
      <Container>
        <EditorViewport />
      </Container>
    );
  }

  if (!activeTab) {
    return null;
  }

  return (
    <Container>
      <EditorHeader
        filePath={activeTab.path}
        projectPath={projectPath}
        isModified={activeTab.isModified}
        isSaving={isSaving}
        hasError={Boolean(activeTab.error)}
        errorMessage={activeTab.error}
        showDiffButton={Boolean(originalContent)}
        showDiffView={showDiffView}
        onSave={handleSave}
        onToggleDiff={() => setShowDiffView((prev) => !prev)}
        showPipelineButton={isPipeline}
        isPipelinePreviewOpen={showPipelinePreview}
        onTogglePipelinePreview={() => setShowPipelinePreview((prev) => !prev)}
      />

      {/*
        Monaco is ALWAYS at the same tree depth: EditorViewport > Box > editor.
        Only the Box's width changes when the split opens/closes, so React never
        unmounts and remounts the Monaco instance on tab switch.
      */}
      <EditorViewport ref={containerRef} sx={{ flexDirection: 'row' }}>
        {/* Left pane — code editor, constant tree depth */}
        <Box
          sx={{
            width: showSplit ? `${splitPercent}%` : '100%',
            height: '100%',
            minWidth: 0,
            flexShrink: 0,
          }}
        >
          {showDiffView && !isLoadingFileStatus ? (
            <DiffView
              modified={activeContent}
              original={originalContent ?? ''}
              language={language}
              theme={monacoTheme}
            />
          ) : (
            <CodeEditor
              content={activeContent}
              originalContent={originalContent}
              language={language}
              theme={monacoTheme}
              onChange={handleChange}
              readOnly={!isFileEditable || showDiffView}
            />
          )}
        </Box>

        {/* Resize handle */}
        {showSplit && (
          <Box
            onMouseDown={(e) => handleResizeStart(e.clientX)}
            sx={{
              width: 4,
              flexShrink: 0,
              cursor: 'col-resize',
              backgroundColor: theme.palette.divider,
              transition: 'background-color 0.15s',
              '&:hover': { backgroundColor: theme.palette.primary.main },
            }}
          />
        )}

        {/* Right pane — live pipeline preview */}
        {showSplit && (
          <Box
            sx={{ flex: 1, height: '100%', minWidth: 0, overflow: 'hidden' }}
          >
            <PipelineView content={activeContent} />
          </Box>
        )}
      </EditorViewport>

      {pendingClose && (
        <UnsavedChangesDialog
          open={Boolean(pendingClose)}
          fileName={pendingClose.tab.title}
          onSave={() => onSaveAndClose(pendingClose.tabId)}
          onDiscard={() => onDiscardAndClose(pendingClose.tabId)}
          onCancel={onCancelClose}
        />
      )}
    </Container>
  );
};
