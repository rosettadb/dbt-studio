import React from 'react';
import { OnChange, loader } from '@monaco-editor/react';
import { useTheme, IconButton, Tooltip } from '@mui/material';
import { VerticalSplit } from '@mui/icons-material';
import {
  useGetFileDiff,
  useGetFileStatus,
  useGitIsInitialized,
  useSaveFileContent,
} from '../../controllers';
import { DiffView } from './diffView';
import { CodeEditor } from './codeEditor';
import { getLanguageFromExtension, getVersionsFromDiff } from './helpers';
import { TabManager } from './tabManager';
import { Container, EditorViewport } from './styles';
import type { EditorTabId, EditorTabState } from './types';

type EditorProps = {
  projectPath: string;
  tabs: EditorTabState[];
  activeTabId: EditorTabId | null;
  onSelectTab: (tabId: EditorTabId) => void;
  onCloseTab: (tabId: EditorTabId) => void;
  onCreateTab?: () => void;
  onTabContentChange: (tabId: EditorTabId, content: string) => void;
  onTabSaved?: (tabId: EditorTabId) => void;
  onTabError?: (tabId: EditorTabId, error?: string) => void;
};

export const Editor: React.FC<EditorProps> = ({
  projectPath,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCreateTab,
  onTabContentChange,
  onTabSaved,
  onTabError,
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
    enabled: Boolean(activeFilePath),
  });
  const { mutate: updateFileContent } = useSaveFileContent();
  const theme = useTheme();
  const monacoTheme = theme.palette.mode === 'dark' ? 'vs-dark' : 'light';
  const language = getLanguageFromExtension(activeFilePath || 'txt');

  const isFileEditable = !activeTab?.isReadOnly;
  const [showDiffView, setShowDiffView] = React.useState(false);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
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
  }, [activeTabId]);

  React.useEffect(() => {
    setShowDiffView(false);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [projectPath, fileStatus, fileDiff, activeTabId]);

  const handleChange: OnChange = (value) => {
    if (value === undefined || !activeTab || !activeTabId) {
      return;
    }
    onTabContentChange(activeTabId, value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      updateFileContent(
        { path: activeTab.path, content: value },
        {
          onSuccess: () => {
            onTabSaved?.(activeTabId);
            onTabError?.(activeTabId, undefined);
          },
          onError: (error) => {
            onTabError?.(activeTabId, error?.message);
          },
        },
      );
    }, 1000);
  };

  if (!activeTab) {
    return (
      <Container>
        <TabManager
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={onSelectTab}
          onClose={onCloseTab}
          onCreateNew={onCreateTab}
        />
        <EditorViewport />
      </Container>
    );
  }

  return (
    <Container>
      <TabManager
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onCreateNew={onCreateTab}
      />
      <EditorViewport>
        {originalContent && (
          <Tooltip title="Compare Changes">
            <IconButton
              onClick={() => setShowDiffView((prev) => !prev)}
              sx={{ position: 'absolute', right: 30, top: 8, zIndex: 999 }}
            >
              <VerticalSplit sx={{ color: 'primary.main' }} />
            </IconButton>
          </Tooltip>
        )}
        {showDiffView && !isLoadingFileStatus && (
          <DiffView
            modified={activeContent}
            original={originalContent ?? ''}
            language={language}
            theme={monacoTheme}
          />
        )}
        {!showDiffView && !isLoadingFileStatus && (
          <CodeEditor
            content={activeContent}
            originalContent={originalContent}
            language={language}
            theme={monacoTheme}
            onChange={handleChange}
            readOnly={!isFileEditable}
          />
        )}
      </EditorViewport>
    </Container>
  );
};
