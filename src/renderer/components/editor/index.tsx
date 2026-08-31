import React from 'react';
import { Box, GlobalStyles, Typography, alpha, useTheme } from '@mui/material';
import { UploadFileOutlined } from '@mui/icons-material';
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
import { MarkdownPreview } from './markdownPreview';
import { HtmlPreview } from './htmlPreview';
import {
  getDecorations,
  getLanguageFromExtension,
  normalizeEol,
} from './helpers';
import { extractModelNameFromPath } from '../../helpers/utils';
import { Container, EditorViewport } from './styles';
import { getOrCreateModel } from '../../lib/monaco/modelStore';
import { buildCteQuery, detectCtes } from '../../utils/sql/cteDetection';
import type {
  EditorTabId,
  EditorTabState,
  PendingCloseState,
} from '../../../types/editor';
import useCli from '../../hooks/useCli';
import {
  MD_PREVIEW_PREFIX,
  getPreviewSourcePath,
  toPreviewPath,
  isVirtualPreviewPath,
} from './previewConstants';

export {
  MD_PREVIEW_PREFIX,
  getPreviewSourcePath,
  toPreviewPath,
  isVirtualPreviewPath,
};

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
  /** Called when the user clicks the Preview button: toggles a preview tab. */
  onTogglePreviewTab?: (currentPath: string, content: string) => void;
  onExecuteQuery?: (payload: {
    sql: string;
    filePath: string;
    modelName?: string;
    compileModel?: boolean;
  }) => void | Promise<void>;
  onExecuteCte?: (payload: {
    sql: string;
    filePath: string;
    cteName: string;
    modelName?: string;
    compileModel?: boolean;
  }) => void | Promise<void>;
  extraActions?: React.ReactNode;
  /** Pending cursor position (e.g. from a "find in files" result) to reveal once its tab is active. */
  revealPosition?: {
    path: string;
    line: number;
    column: number;
    length: number;
  } | null;
  /** Called once `revealPosition` has been applied, so the parent can clear it. */
  onRevealHandled?: () => void;
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
  onTogglePreviewTab,
  onExecuteQuery,
  onExecuteCte,
  extraActions,
  revealPosition,
  onRevealHandled,
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

  // Detect if the active tab is a markdown preview virtual tab
  const previewSourcePath = getPreviewSourcePath(activeFilePath);
  const isPreviewTab = previewSourcePath !== null;
  const isHtmlPreview = /\.html?$/i.test(previewSourcePath ?? '');

  // The content to render in the preview: from the live source tab if available
  const previewContent = React.useMemo(() => {
    if (!isPreviewTab) return '';
    const sourceTab = tabs.find((t) => t.path === previewSourcePath);
    return sourceTab?.content ?? activeContent;
  }, [isPreviewTab, previewSourcePath, tabs, activeContent]);

  // Whether the current source file has a preview tab open
  const showPreview = React.useMemo(() => {
    if (!activeFilePath) return false;
    const realSourcePath = isPreviewTab ? previewSourcePath! : activeFilePath;
    const previewPath = toPreviewPath(realSourcePath);
    return tabs.some((t) => t.path === previewPath);
  }, [activeFilePath, isPreviewTab, previewSourcePath, tabs]);

  // Handle Preview button click: delegate up to projectDetails which owns openTab
  const handleTogglePreview = React.useCallback(() => {
    if (!onTogglePreviewTab || !activeFilePath) return;
    onTogglePreviewTab(activeFilePath, activeContent);
  }, [onTogglePreviewTab, activeFilePath, activeContent]);

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

  // Drag-and-drop for OS files dropped onto the editor — opens each as a
  // tab without copying it into the project (that's the sidebar's job).
  const [isDragActive, setIsDragActive] = React.useState(false);
  const dragCounterRef = React.useRef(0);

  const isExternalFileDrag = (e: React.DragEvent<HTMLDivElement>) =>
    Array.from(e.dataTransfer.types).includes('Files');

  const handleEditorDragEnter = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDragActive(true);
    },
    [],
  );

  const handleEditorDragOver = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [],
  );

  const handleEditorDragLeave = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isExternalFileDrag(e)) return;
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragActive(false);
      }
    },
    [],
  );

  const handleEditorDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragActive(false);

      Array.from(e.dataTransfer.files).forEach((file) => {
        const filePath = (file as unknown as { path?: string }).path;
        if (filePath) onOpenFile?.(filePath);
      });
    },
    [onOpenFile],
  );

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

  // Applies a pending "find in files" jump once its tab is active and the
  // editor has swapped to that tab's model (activeContent sync runs first).
  React.useEffect(() => {
    if (!editorInstance || !revealPosition) return;
    if (activeTab?.path !== revealPosition.path) return;
    const { line, column, length } = revealPosition;
    const range = new monaco.Range(line, column, line, column + length);
    editorInstance.revealRangeInCenter(range);
    editorInstance.setSelection(range);
    editorInstance.focus();
    onRevealHandled?.();
  }, [editorInstance, revealPosition, activeTab?.path, onRevealHandled]);

  React.useEffect(() => {
    if (!onExecuteQuery && !onExecuteCte) {
      return undefined;
    }

    const runQueryCommandId = `dbtStudio.executeQuery.${projectId ?? 'project'}`;
    const runCteCommandId = `dbtStudio.executeCte.${projectId ?? 'project'}`;

    const runQueryCommand = monaco.editor.registerCommand(
      runQueryCommandId,
      (_accessor, args?: { uri?: string }) => {
        const model = editorInstance?.getModel();
        if (
          !model ||
          model.uri.toString() !== args?.uri ||
          !activeTab ||
          !activeTab.path.endsWith('.sql')
        ) {
          return;
        }

        const selection = editorInstance?.getSelection();
        const selectedSql =
          selection && !selection.isEmpty()
            ? model.getValueInRange(selection)
            : model.getValue();

        onExecuteQuery?.({
          sql: selectedSql,
          filePath: activeTab.path,
          modelName: extractModelNameFromPath(activeTab.path),
          compileModel: selection?.isEmpty() ?? true,
        });
      },
    );

    const runCteCommand = monaco.editor.registerCommand(
      runCteCommandId,
      (_accessor, args?: { uri?: string; cteIndex?: number }) => {
        const model = editorInstance?.getModel();
        if (
          !model ||
          model.uri.toString() !== args?.uri ||
          args?.cteIndex === undefined ||
          !activeTab ||
          !activeTab.path.endsWith('.sql')
        ) {
          return;
        }

        const ctes = detectCtes(model, monaco);
        const builtQuery = buildCteQuery(model, ctes, args.cteIndex);
        if (!builtQuery) {
          return;
        }

        onExecuteCte?.({
          sql: builtQuery.query,
          filePath: activeTab.path,
          cteName: builtQuery.targetCte.name,
          modelName: extractModelNameFromPath(activeTab.path),
          compileModel: true,
        });
      },
    );

    const provider = monaco.languages.registerCodeLensProvider('jinja-sql', {
      provideCodeLenses(model) {
        if (
          !activeTab ||
          !activeTab.path.endsWith('.sql') ||
          model.uri.toString() !== activeModel?.uri.toString()
        ) {
          return { lenses: [], dispose: () => {} };
        }

        const lenses: monaco.languages.CodeLens[] = [
          {
            range: new monaco.Range(1, 1, 1, 1),
            command: {
              id: runQueryCommandId,
              title: '$(play) Execute Query',
              arguments: [{ uri: model.uri.toString() }],
            },
          },
        ];

        const ctes = detectCtes(model, monaco);
        ctes.forEach((cte, index) => {
          lenses.push({
            range: new monaco.Range(
              cte.range.startLineNumber,
              1,
              cte.range.startLineNumber,
              1,
            ),
            command: {
              id: runCteCommandId,
              title: `$(play) Execute CTE: ${cte.name}`,
              arguments: [{ uri: model.uri.toString(), cteIndex: index }],
            },
          });
        });

        return { lenses, dispose: () => {} };
      },
    });

    return () => {
      provider.dispose();
      runQueryCommand.dispose();
      runCteCommand.dispose();
    };
  }, [
    activeModel,
    activeTab,
    editorInstance,
    onExecuteCte,
    onExecuteQuery,
    projectId,
  ]);

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

  const dragOverlay = isDragActive && (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        border: '2px dashed',
        borderColor: 'primary.main',
        bgcolor: alpha(theme.palette.primary.main, 0.08),
        pointerEvents: 'none',
      }}
    >
      <UploadFileOutlined sx={{ fontSize: 32, color: 'primary.main' }} />
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, color: 'primary.main' }}
      >
        Drop to open file
      </Typography>
    </Box>
  );

  if (tabs.length === 0) {
    return (
      <Container
        onDragEnter={handleEditorDragEnter}
        onDragOver={handleEditorDragOver}
        onDragLeave={handleEditorDragLeave}
        onDrop={handleEditorDrop}
      >
        <EditorViewport />
        {dragOverlay}
      </Container>
    );
  }

  if (!activeTab) return null;

  // --- Markdown preview tab: render MarkdownPreview instead of Monaco ---
  if (isPreviewTab) {
    return (
      <Container
        onDragEnter={handleEditorDragEnter}
        onDragOver={handleEditorDragOver}
        onDragLeave={handleEditorDragLeave}
        onDrop={handleEditorDrop}
      >
        <EditorHeader
          filePath={previewSourcePath ?? ''}
          projectPath={projectPath}
          isModified={false}
          isSaving={false}
          hasError={false}
          showDiffButton={false}
          showDiffView={false}
          showPreview
          onSave={() => {}}
          onToggleDiff={() => {}}
          onTogglePreview={handleTogglePreview}
          onNavigate={onOpenFile}
        />
        <EditorViewport>
          {isHtmlPreview ? (
            <HtmlPreview filePath={previewSourcePath ?? ''} />
          ) : (
            <MarkdownPreview content={previewContent} />
          )}
        </EditorViewport>
        {dragOverlay}
      </Container>
    );
  }

  return (
    <Container
      onDragEnter={handleEditorDragEnter}
      onDragOver={handleEditorDragOver}
      onDragLeave={handleEditorDragLeave}
      onDrop={handleEditorDrop}
    >
      <EditorHeader
        filePath={activeTab.path}
        projectPath={projectPath}
        isModified={activeTab.isModified}
        isSaving={isSaving}
        hasError={Boolean(activeTab.error)}
        errorMessage={activeTab.error}
        showDiffButton={hasUncommittedChanges}
        showDiffView={showDiffView}
        showPreview={showPreview}
        onSave={handleSave}
        onToggleDiff={() => setShowDiffView((prev) => !prev)}
        onTogglePreview={handleTogglePreview}
        onNavigate={onOpenFile}
        onRun={
          language === 'python'
            ? () => {
                const pythonExe = settings?.pythonPath || 'python3';
                if (activeTab.isModified) {
                  // Auto-save unsaved changes so the on-disk file matches
                  // what the user sees before running.
                  updateFileContent(
                    { path: activeTab.path, content: activeContent },
                    {
                      onSuccess: () =>
                        runCommandAsync(pythonExe, [activeTab.path]),
                    },
                  );
                } else {
                  runCommandAsync(pythonExe, [activeTab.path]);
                }
              }
            : undefined
        }
        extraActions={extraActions}
      />

      <EditorViewport>
        <GlobalStyles
          styles={{
            '.monaco-editor .codelens-decoration': {
              left: '0 !important',
              paddingLeft: '0 !important',
              whiteSpace: 'nowrap',
            },
            '.monaco-editor .codelens-decoration > a': {
              position: 'relative',
              left: -10,
            },
            '.monaco-editor .codelens-decoration .codicon': {
              fontSize: 11,
              marginRight: 3,
            },
          }}
        />
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
            options={{ codeLens: true, codeLensFontSize: 11 }}
            onMount={handleEditorMount}
          />
        )}
      </EditorViewport>
      {dragOverlay}

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
