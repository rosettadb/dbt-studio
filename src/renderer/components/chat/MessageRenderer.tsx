import React from 'react';
import styled from '@mui/material/styles/styled';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import {
  ContentCopy,
  UploadFile,
  ExpandMore,
  Terminal,
} from '@mui/icons-material';
import Collapse from '@mui/material/Collapse';
import { useAppContext } from '../../hooks';
import { useSaveFileContent } from '../../controllers';

import { ToggleSection } from './ToggleSection';
import { ContextItemRow } from './ContextItemRow';
import { ThinkingRow } from './ThinkingRow';
import { ResponseActions } from './ResponseActions';
import { AgentStepBlock } from './AgentStepBlock';
import { ToolCallRow } from './ToolCallRow';
import type {
  AgentStep,
  ToolCallState,
  StreamContentPart,
  ToolCallContentPart,
} from '../../hooks/useAgentStream';

interface MessageRendererProps {
  content: string;
  role: 'user' | 'assistant' | string;
  contextItems?: Array<{
    id: number;
    name: string;
    description?: string;
    type: string;
    content: string;
    metadata?: any;
  }>;
  toolCalls?: Array<{
    id: number;
    toolName: string;
    toolInput: any;
    toolOutput: any;
    status: string;
    errorMessage?: string | null;
  }>;
  messageId: number;
  isStreaming?: boolean;
  reasoning?: { text: string; durationMs?: number };
  onDelete?: () => void;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  showTokenCount?: boolean;
  orderedParts?: StreamContentPart[];
}

/**
 * Converts persisted DB tool calls into AgentStep[] for rendering with AgentStepBlock.
 * Tool calls are grouped by _stepNumber stored in toolInput.
 */
function buildStepsFromToolCalls(
  toolCalls: NonNullable<MessageRendererProps['toolCalls']>,
): AgentStep[] {
  const stepMap = new Map<number, AgentStep>();

  toolCalls.forEach((tc) => {
    const stepNumber: number = (tc.toolInput?.stepNum as number) ?? 0;
    const toolCallId: string = (tc.toolInput?.tcId as string) ?? String(tc.id);

    // Build display args by omitting internal metadata keys
    const displayArgs: Record<string, unknown> = {};
    const INTERNAL_KEYS = new Set(['stepNum', 'tcId']);
    if (tc.toolInput) {
      Object.entries(tc.toolInput as Record<string, unknown>).forEach(
        ([k, v]) => {
          if (!INTERNAL_KEYS.has(k)) {
            displayArgs[k] = v;
          }
        },
      );
    }

    const statusMap: Record<string, 'done' | 'error'> = {
      completed: 'done',
      failed: 'error',
    };

    const toolCallState: ToolCallState = {
      id: toolCallId,
      toolName: tc.toolName,
      args: displayArgs as Record<string, unknown>,
      result: tc.toolOutput,
      error: tc.errorMessage ?? undefined,
      status: statusMap[tc.status] ?? 'done',
    };

    if (!stepMap.has(stepNumber)) {
      stepMap.set(stepNumber, {
        stepNumber,
        toolCalls: [],
        startedAt: 0,
      });
    }
    stepMap.get(stepNumber)!.toolCalls.push(toolCallState);
  });

  return Array.from(stepMap.values()).sort(
    (a, b) => a.stepNumber - b.stepNumber,
  );
}

const MessageContainer = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: 4,
  padding: theme.spacing(0.5),
  marginBottom: theme.spacing(0.125),
  minWidth: 0,
  maxWidth: '100%',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  fontSize: '12px',
  lineHeight: 1.4,
}));

const UserMessage = styled(MessageContainer)(({ theme }) => ({
  backgroundColor:
    theme.palette.mode === 'dark' ? '#3b3b3f' : theme.palette.grey[200],
  color: theme.palette.text.primary,
  width: 'fit-content',
  maxWidth: '85%',
  boxSizing: 'border-box',
  marginBottom: 8,
  padding: theme.spacing(0.75),
}));

const AssistantMessage = styled(MessageContainer)(({ theme }) => ({
  alignSelf: 'flex-start',
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  paddingBottom: theme.spacing(2),
}));

type MarkdownCodeBlockProps = React.PropsWithChildren<{
  inline?: boolean;
  className?: string;
}>;

function detectCodeBlockMeta(
  className?: string,
  code?: string,
): {
  language: string;
  filename?: string;
} {
  const language = (className?.replace('language-', '') ?? '').toLowerCase();
  const firstLine = (code || '').split('\n')[0]?.trim() ?? '';
  const filenameMatch = firstLine.match(/^(?:\/\/|--|#)\s*filename:\s*(.+)$/i);
  return { language, filename: filenameMatch?.[1]?.trim() };
}

const MarkdownCodeBlock = ({
  inline,
  className,
  children,
}: MarkdownCodeBlockProps) => {
  const muiTheme = useTheme();
  const { mutate: updateFileContent } = useSaveFileContent();
  const { editingFilePath, syncEditorContent } = useAppContext();
  const [copied, setCopied] = React.useState(false);
  const [applied, setApplied] = React.useState(false);
  const [expanded, setExpanded] = React.useState(true);

  const codeRef = React.useRef<HTMLElement | null>(null);
  const copy = React.useCallback(async () => {
    const text =
      codeRef.current?.innerText || codeRef.current?.textContent || '';
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (_) {
      // ignore
    }
  }, []);

  const apply = React.useCallback(async () => {
    if (!editingFilePath) {
      return;
    }

    const text =
      codeRef.current?.innerText || codeRef.current?.textContent || '';

    updateFileContent({
      path: editingFilePath,
      content: text,
    });
    syncEditorContent?.(editingFilePath, text);
    setApplied(true);
    setTimeout(() => setApplied(false), 1000);
  }, [editingFilePath, updateFileContent, syncEditorContent]);

  const runInTerminal = React.useCallback(() => {
    const text =
      codeRef.current?.innerText || codeRef.current?.textContent || '';
    window.electron.ipcRenderer.invoke('utils:run-in-terminal', {
      command: text,
    });
  }, []);

  const childText = React.useMemo(() => {
    return React.Children.toArray(children)
      .map((child) => {
        if (typeof child === 'string') {
          return child;
        }
        if (
          React.isValidElement(child) &&
          typeof child.props.children === 'string'
        ) {
          return child.props.children;
        }
        return '';
      })
      .join('');
  }, [children]);

  const shouldRenderInline = React.useMemo(() => {
    if (inline) return true;
    const normalized = childText.replace(/\s+$/g, '');
    return !normalized.includes('\n');
  }, [childText, inline]);

  const { language, filename } = React.useMemo(
    () => detectCodeBlockMeta(className, childText),
    [className, childText],
  );
  const isShellBlock = ['bash', 'sh', 'shell', 'zsh'].includes(language);

  const toolbarBtnSx = {
    width: 20,
    height: 20,
    minWidth: 'unset',
    bgcolor: (theme: any) =>
      theme.palette.mode === 'dark'
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(0,0,0,0.06)',
    backdropFilter: 'blur(4px)',
    color: (theme: any) => (theme.palette.mode === 'dark' ? '#d4d4d4' : '#666'),
    '&:hover': {
      bgcolor: (theme: any) =>
        theme.palette.mode === 'dark'
          ? 'rgba(255,255,255,0.15)'
          : 'rgba(0,0,0,0.12)',
    },
  };

  return !shouldRenderInline ? (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 0.5,
        my: 0.5,
        overflow: 'hidden',
      }}
    >
      {/* Sticky toolbar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 1,
          py: 0.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
          position: 'sticky',
          top: -8,
          zIndex: 1,
          bgcolor: 'background.paper',
          fontSize: '11px',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ExpandMore
            onClick={() => setExpanded((p) => !p)}
            sx={{
              fontSize: 14,
              cursor: 'pointer',
              color: 'text.secondary',
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.15s ease',
            }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ userSelect: 'none' }}
          >
            {filename ?? language ?? 'code'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isShellBlock && (
            <Tooltip title="Run in terminal">
              <IconButton
                size="small"
                onClick={runInTerminal}
                sx={toolbarBtnSx}
              >
                <Terminal sx={{ fontSize: 11 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={copied ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={copy} sx={toolbarBtnSx}>
              <ContentCopy sx={{ fontSize: 11 }} />
            </IconButton>
          </Tooltip>
          {editingFilePath && (
            <Tooltip title={applied ? 'Applied!' : 'Apply to current file'}>
              <IconButton size="small" onClick={apply} sx={toolbarBtnSx}>
                <UploadFile sx={{ fontSize: 11 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Code content */}
      <Collapse in={expanded} timeout={200}>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1,
            overflowX: 'auto',
            fontSize: '12px',
            lineHeight: 1.4,
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)'
                : 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
            color: (theme) =>
              theme.palette.mode === 'dark' ? '#d4d4d4' : '#333',
            '& code': {
              background: 'transparent !important',
              color: 'inherit !important',
              padding: '0 !important',
              borderRadius: '0 !important',
            },
          }}
        >
          <code ref={codeRef} className={className}>
            {children}
          </code>
        </Box>
      </Collapse>
    </Box>
  ) : (
    <code
      ref={codeRef}
      className={`${className || ''} inline-code`}
      style={{
        fontFamily: 'monospace',
        fontSize: '12px',
        fontWeight: 500,
        fontStyle: 'normal',
        padding: '2px 4px',
        backgroundColor:
          muiTheme.palette.mode === 'dark'
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.06)',
        color: muiTheme.palette.mode === 'dark' ? '#ce9178' : '#d16969',
        borderRadius: '4px',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.4,
      }}
    >
      {children}
    </code>
  );
};

const MarkdownParagraph: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box
    component="p"
    sx={{
      m: 0,
      fontSize: '13px',
      lineHeight: 1.4,
      '&:not(:last-child)': { mb: 0.5 },
    }}
  >
    {children}
  </Box>
);

// Defined outside MessageRenderer so React sees stable component references
// across renders (avoids "component defined during render" warning).
const MarkdownUl: React.FC<React.PropsWithChildren> = ({ children }) => (
  <ul
    style={{
      margin: '0.4rem 0',
      paddingLeft: '0.5rem',
      fontSize: '13px',
      lineHeight: 1.5,
      listStyleType: 'disc',
      listStylePosition: 'inside',
      display: 'block',
    }}
  >
    {children}
  </ul>
);
const MarkdownOl: React.FC<React.PropsWithChildren> = ({ children }) => (
  <ol
    style={{
      margin: '0.4rem 0',
      paddingLeft: '0.5rem',
      fontSize: '13px',
      lineHeight: 1.5,
      listStyleType: 'decimal',
      listStylePosition: 'inside',
      display: 'block',
    }}
  >
    {children}
  </ol>
);
const MarkdownLi: React.FC<React.PropsWithChildren> = ({ children }) => (
  <li
    style={{
      margin: '0.2rem 0',
      fontSize: '13px',
      lineHeight: 1.5,
      display: 'list-item',
    }}
  >
    {children}
  </li>
);
const MarkdownH1: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h1
    style={{
      fontSize: '0.9rem',
      fontWeight: 600,
      margin: '0.4rem 0 0.2rem',
      color: 'inherit',
    }}
  >
    {children}
  </h1>
);
const MarkdownH2: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h2
    style={{
      fontSize: '0.85rem',
      fontWeight: 600,
      margin: '0.4rem 0 0.2rem',
      color: 'inherit',
    }}
  >
    {children}
  </h2>
);
const MarkdownH3: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h3
    style={{
      fontSize: '0.8rem',
      fontWeight: 600,
      margin: '0.4rem 0 0.2rem',
      color: 'inherit',
    }}
  >
    {children}
  </h3>
);
const MarkdownH4: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h4
    style={{
      fontSize: '0.78rem',
      fontWeight: 600,
      margin: '0.3rem 0 0.15rem',
      color: 'inherit',
    }}
  >
    {children}
  </h4>
);
const MarkdownH5: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h5
    style={{
      fontSize: '0.75rem',
      fontWeight: 600,
      margin: '0.3rem 0 0.15rem',
      color: 'inherit',
    }}
  >
    {children}
  </h5>
);
const MarkdownH6: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h6
    style={{
      fontSize: '0.75rem',
      fontWeight: 600,
      margin: '0.3rem 0 0.15rem',
      color: 'inherit',
    }}
  >
    {children}
  </h6>
);
const MarkdownStrong: React.FC<React.PropsWithChildren> = ({ children }) => (
  <strong style={{ fontWeight: 600 }}>{children}</strong>
);
const MarkdownEm: React.FC<React.PropsWithChildren> = ({ children }) => (
  <em style={{ fontStyle: 'italic' }}>{children}</em>
);
const MarkdownA: React.FC<React.PropsWithChildren & { href?: string }> = ({
  children,
  href,
}) => (
  <a href={href} style={{ color: 'inherit', textDecoration: 'underline' }}>
    {children}
  </a>
);

const markdownComponents = {
  code: MarkdownCodeBlock,
  p: MarkdownParagraph,
  ul: MarkdownUl,
  ol: MarkdownOl,
  li: MarkdownLi,
  h1: MarkdownH1,
  h2: MarkdownH2,
  h3: MarkdownH3,
  h4: MarkdownH4,
  h5: MarkdownH5,
  h6: MarkdownH6,
  strong: MarkdownStrong,
  em: MarkdownEm,
  a: MarkdownA,
};

export const MessageRenderer: React.FC<MessageRendererProps> = ({
  content,
  role,
  contextItems,
  toolCalls,
  messageId,
  isStreaming = false,
  reasoning,
  onDelete,
  tokenUsage,
  showTokenCount,
  orderedParts,
}) => {
  const Container = role === 'user' ? UserMessage : AssistantMessage;
  const { setEditingFilePath } = useAppContext();

  // Build AgentStep[] from persisted tool calls for history rendering
  const persistedSteps = React.useMemo(() => {
    if (!toolCalls || toolCalls.length === 0) return [];
    return buildStepsFromToolCalls(toolCalls);
  }, [toolCalls]);

  // Fallback: if content looks like HTML (legacy TipTap), strip tags for display
  const displayContent = React.useMemo(() => {
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(content || '');
    if (!looksLikeHtml) return content;
    const div = document.createElement('div');
    div.innerHTML = content || '';
    const text = div.textContent || div.innerText || '';
    // Collapse excessive blank lines
    return text.replace(/\u00A0/g, ' ').replace(/\n{3,}/g, '\n\n');
  }, [content]);

  return role === 'user' ? (
    // Full-width row that right-aligns the bubble with symmetric spacing
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Container>
        {/* Show context items for user messages */}
        {contextItems && contextItems.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <ToggleSection
              title={`${contextItems.length} context ${contextItems.length > 1 ? 'items' : 'item'}`}
              defaultOpen={false}
            >
              {contextItems.map((item) => (
                <ContextItemRow
                  key={item.id}
                  name={item.name}
                  description={item.description ?? ''}
                  filePath={item.metadata?.path}
                  onOpen={(filePath) => {
                    if (filePath) setEditingFilePath?.(filePath);
                  }}
                />
              ))}
            </ToggleSection>
          </Box>
        )}
        <div className="markdown-content">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={markdownComponents}
          >
            {displayContent}
          </Markdown>
        </div>
      </Container>
    </Box>
  ) : (
    <Container>
      {/* Thinking row for assistant */}
      {reasoning?.text?.trim() && (
        <ThinkingRow
          content={reasoning.text}
          durationMs={reasoning.durationMs}
          inProgress={false}
        />
      )}

      {/* Interleaved Rendering (new style) vs Legacy block rendering */}
      {orderedParts && orderedParts.length > 0 ? (
        <Box sx={{ mt: 0.25 }}>
          {orderedParts.map((part, idx) => {
            if (part.type === 'text') {
              if (!part.text) return null;
              // Fallback: if content looks like HTML (legacy TipTap), strip tags for display
              const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(part.text);
              let partDisplayContent = part.text;
              if (looksLikeHtml) {
                const div = document.createElement('div');
                div.innerHTML = part.text;
                const text = div.textContent || div.innerText || '';
                partDisplayContent = text
                  .replace(/\u00A0/g, ' ')
                  .replace(/\n{3,}/g, '\n\n');
              }
              return (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={`persisted-text-${idx}`}
                  className="markdown-content"
                >
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={markdownComponents}
                  >
                    {partDisplayContent}
                  </Markdown>
                </div>
              );
            }
            // tool-call part
            const tc = part as ToolCallContentPart;
            return (
              <ToolCallRow
                key={tc.toolCallId}
                toolCall={{
                  id: tc.toolCallId,
                  toolName: tc.toolName,
                  args: tc.args,
                  result: tc.result,
                  error: tc.error,
                  status: tc.status,
                  durationMs: tc.durationMs,
                }}
              />
            );
          })}
        </Box>
      ) : (
        <>
          {/* Legacy: Persisted agent steps (tool calls from history) */}
          {persistedSteps.length > 0 && (
            <Box sx={{ mb: 0.5 }}>
              {persistedSteps.map((step) => (
                <AgentStepBlock
                  key={`persisted-${messageId}-step-${step.stepNumber}`}
                  step={step}
                  isActive={false}
                />
              ))}
            </Box>
          )}

          {/* Legacy: Message content block */}
          <div className="markdown-content">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {displayContent}
            </Markdown>
          </div>
        </>
      )}

      {/* Response Actions */}
      <ResponseActions
        content={content}
        role={role}
        messageId={messageId}
        isStreaming={isStreaming}
        onDelete={onDelete}
        tokenUsage={tokenUsage}
        showTokenCount={showTokenCount}
      />
    </Container>
  );
};
