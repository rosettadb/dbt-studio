import React from 'react';
import { useTheme } from '@mui/material';
import * as monaco from 'monaco-editor';
import {
  useGetFileHeadContent,
  useGitIsInitialized,
  useSaveFileContent,
  useGetSettings,
} from '../../controllers';
import { MonacoCodeEditor } from '../monaco/MonacoCodeEditor';
import { DiffView } from './diffView';
import { EditorHeader } from './editorHeader';
import { UnsavedChangesDialog } from './unsavedChangesDialog';
import {
  getDecorations,
  getLanguageFromExtension,
  normalizeEol,
} from './helpers';
import { Container, EditorViewport } from './styles';
import { getOrCreateModel } from '../../lib/monaco/modelStore';
import type {
  EditorTabId,
  EditorTabState,
  PendingCloseState,
} from '../../../types/editor';
import useCli from '../../hooks/useCli';

type EditorProps = {
  projectId?: string;
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
  onOpenFile?: (filePath: string) => void;
  extraActions?: React.ReactNode;
};

type DecorationMode = 'untracked' | 'modified' | 'clean';

const DECORATION_DEBOUNCE_MS = 150;

const computeLanguage = (path: string): string => {
  const base = getLanguageFromExtension(path || 'txt');
  return base === 'sql' ? 'jinja-sql' : base;
};

/**
 * Top-level file editor. Wires the tab manager state into a single
 * MonacoCodeEditor instance: one model per open tab, view state preserved
 * across switches, git diff markers in the gutter, save and unsaved-close
 * flows. Tab lifecycle (open/close/dispose) is owned by useTabManager —
 * this component is purely presentational over that state.
 */
export const Editor: React.FC<EditorProps> = ({
  projectId,
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
  onOpenFile,
  extraActions,
}) => {
  const theme = useTheme();
  const monacoTheme = theme.palette.mode === 'dark' ? 'vs-dark' : 'light';

  const activeTab = React.useMemo(
    () => tabs.find((t) => t.id === activeTabId),
    [tabs, activeTabId],
  );
  const activeFilePath = activeTab?.path ?? '';
  const activeContent = activeTab?.content ?? '';
  const language = computeLanguage(activeFilePath);
  const isFileEditable = !activeTab?.isReadOnly;

  const { data: isInitialized } = useGitIsInitialized(projectPath, {
    enabled: Boolean(projectPath),
  });
  const { data: headContent } = useGetFileHeadContent(
    projectPath,
    activeFilePath,
    {
      enabled: Boolean(activeFilePath && isInitialized && projectPath),
    },
  );
  const { mutate: updateFileContent } = useSaveFileContent();

  const [showDiffView, setShowDiffView] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const { runCommandAsync } = useCli();
  const { data: settings } = useGetSettings();

  const decorationMode: DecorationMode = React.useMemo(() => {
    if (!activeTab) return 'clean';
    if (headContent === undefined) return 'clean';
    if (headContent === null) return 'untracked';
    return 'modified';
  }, [activeTab, headContent]);

  const originalContent = React.useMemo(() => {
    if (decorationMode === 'untracked') return null;
    if (decorationMode === 'clean') return activeContent;
    return headContent ?? activeContent;
  }, [decorationMode, headContent, activeContent]);

  const hasUncommittedChanges = React.useMemo(() => {
    if (headContent == null) return false;
    return normalizeEol(headContent) !== normalizeEol(activeContent);
  }, [headContent, activeContent]);

  React.useEffect(() => {
    setShowDiffView(false);
  }, [activeTabId]);

  const activeModel = React.useMemo<monaco.editor.ITextModel | null>(() => {
    if (!activeTab) return null;
    return getOrCreateModel(
      projectId,
      activeTab.path,
      activeTab.content,
      computeLanguage(activeTab.path),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.path, projectId]);

  // External content updates (refresh from disk, AI apply, etc.) push into
  // the model. Keystrokes already update both sides, so this is a no-op
  // for typing.
  const isApplyingExternalContentRef = React.useRef(false);
  React.useEffect(() => {
    if (!activeModel) return;
    if (activeModel.getValue() === activeContent) return;
    isApplyingExternalContentRef.current = true;
    activeModel.setValue(activeContent);
    isApplyingExternalContentRef.current = false;
  }, [activeModel, activeContent]);

  React.useEffect(() => {
    if (!activeModel || !activeTabId) return undefined;
    const subscription = activeModel.onDidChangeContent(() => {
      if (isApplyingExternalContentRef.current) return;
      onTabContentChange(activeTabId, activeModel.getValue());
    });
    return () => subscription.dispose();
  }, [activeModel, activeTabId, onTabContentChange]);

  React.useEffect(() => {
    if (!activeModel) return;
    if (activeModel.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(activeModel, language);
    }

    activeModel.updateOptions({
      tabSize: language === 'python' ? 4 : 2,
      insertSpaces: true,
    });
  }, [activeModel, language]);

  // Git diff line markers. The editor instance lives in state (not a ref)
  // so the decoration effect can react to its mount.
  const [editorInstance, setEditorInstance] =
    React.useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef =
    React.useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  const handleEditorMount = React.useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      setEditorInstance(editor);
      return () => setEditorInstance(null);
    },
    [],
  );

  React.useEffect(() => {
    if (!editorInstance || !activeModel || decorationMode === 'clean') {
      decorationsRef.current?.clear();
      decorationsRef.current = null;
      return undefined;
    }
    // Debounce so per-keystroke `diffLines` calls don't pile up on large
    // files. The marker visualisation is a hint, not a critical signal.
    const handle = setTimeout(() => {
      const model = editorInstance.getModel();
      if (!model) return;
      const decorations = getDecorations(
        originalContent,
        activeContent,
        model.getLineCount(),
        (i: number) => new monaco.Range(i, 1, i, 1),
      ) as monaco.editor.IModelDeltaDecoration[];
      if (!decorationsRef.current) {
        decorationsRef.current =
          editorInstance.createDecorationsCollection(decorations);
      } else {
        decorationsRef.current.set(decorations);
      }
    }, DECORATION_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [
    editorInstance,
    activeModel,
    activeContent,
    originalContent,
    decorationMode,
  ]);

  const handleSave = React.useCallback(() => {
    if (!activeTab || !activeTabId || !activeTab.isModified || isSaving) return;
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

  if (tabs.length === 0) {
    return (
      <Container>
        <EditorViewport />
      </Container>
    );
  }

  if (!activeTab) return null;

  return (
    <Container>
      <EditorHeader
        filePath={activeTab.path}
        projectPath={projectPath}
        isModified={activeTab.isModified}
        isSaving={isSaving}
        hasError={Boolean(activeTab.error)}
        errorMessage={activeTab.error}
        showDiffButton={hasUncommittedChanges}
        showDiffView={showDiffView}
        onSave={handleSave}
        onToggleDiff={() => setShowDiffView((prev) => !prev)}
        onNavigate={onOpenFile}
        onRun={
          language === 'python'
            ? () => {
                const pythonExe = settings?.pythonPath
                  ? `"${settings.pythonPath}"`
                  : 'python3';
                runCommandAsync(`${pythonExe} "${activeTab.path}"`);
              }
            : undefined
        }
        extraActions={extraActions}
      />

      <EditorViewport>
        {showDiffView ? (
          <DiffView
            modified={activeContent}
            original={originalContent ?? ''}
            language={language}
            theme={monacoTheme}
          />
        ) : (
          <MonacoCodeEditor
            model={activeModel}
            modelKey={activeTabId}
            theme={monacoTheme}
            readOnly={!isFileEditable}
            onMount={handleEditorMount}
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
