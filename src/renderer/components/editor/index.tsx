import React from 'react';
import { OnChange, loader } from '@monaco-editor/react';
import { useTheme } from '@mui/material';
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
  const [isPipelineView, setIsPipelineView] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const showPipelineButton = isPipelineFile(activeFilePath);

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
    setIsPipelineView(false);
  }, [activeTabId]);

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
        showPipelineButton={showPipelineButton}
        isPipelineView={isPipelineView}
        onTogglePipelineView={() => setIsPipelineView((prev) => !prev)}
      />

      <EditorViewport>
        {isPipelineView && <PipelineView content={activeContent} />}
        {!isPipelineView && showDiffView && !isLoadingFileStatus && (
          <DiffView
            modified={activeContent}
            original={originalContent ?? ''}
            language={language}
            theme={monacoTheme}
          />
        )}
        {!isPipelineView && !showDiffView && !isLoadingFileStatus && (
          <CodeEditor
            content={activeContent}
            originalContent={originalContent}
            language={language}
            theme={monacoTheme}
            onChange={handleChange}
            readOnly={!isFileEditable || showDiffView}
          />
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
