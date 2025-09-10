import React from 'react';
import styled from '@mui/material/styles/styled';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

interface MessageRendererProps {
  content: string;
  role: 'user' | 'assistant' | string;
}

const MessageContainer = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: 6,
  padding: theme.spacing(0.75),
  marginBottom: theme.spacing(0.5),
  maxWidth: 'min(75%, 720px)',
  wordBreak: 'break-word',
  fontSize: '13px',
  lineHeight: 1.55,
}));

const UserMessage = styled(MessageContainer)(({ theme }) => ({
  alignSelf: 'flex-end',
  backgroundColor:
    theme.palette.mode === 'dark'
      ? theme.palette.grey[800]
      : theme.palette.grey[200],
  color: theme.palette.text.primary,
}));

const AssistantMessage = styled(MessageContainer)(({ theme }) => ({
  alignSelf: 'flex-start',
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  // Make assistant messages use the full available width of the list
  width: '100%',
  maxWidth: '100%',
}));

type MarkdownCodeBlockProps = React.PropsWithChildren<{
  inline?: boolean;
  className?: string;
}>;

const MarkdownCodeBlock = ({
  inline,
  className,
  children,
}: MarkdownCodeBlockProps) => {
  const [copied, setCopied] = React.useState(false);
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

  return !inline ? (
    <Box
      component="pre"
      sx={{
        background: (theme) =>
          theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)'
            : 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
        color: (theme) => (theme.palette.mode === 'dark' ? '#d4d4d4' : '#333'),
        p: 1.5,
        fontSize: '13px',
        borderRadius: 1,
        overflow: 'auto',
        position: 'relative',
        border: (theme) => `1px solid ${theme.palette.divider}`,
        boxShadow: (theme) =>
          theme.palette.mode === 'dark'
            ? 'inset 0 1px 3px rgba(0,0,0,0.3)'
            : 'inset 0 1px 3px rgba(0,0,0,0.1)',
        '& code': {
          background: 'transparent !important',
          color: 'inherit !important',
          padding: '0 !important',
          borderRadius: '0 !important',
        },
      }}
    >
      <Tooltip title={copied ? 'Copied!' : 'Copy code'} placement="left">
        <IconButton
          size="small"
          onClick={copy}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 20,
            height: 20,
            minWidth: 'unset',
            bgcolor: (theme) =>
              theme.palette.mode === 'dark'
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(0,0,0,0.06)',
            backdropFilter: 'blur(4px)',
            color: (theme) =>
              theme.palette.mode === 'dark' ? '#d4d4d4' : '#666',
            '&:hover': {
              bgcolor: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'rgba(255,255,255,0.15)'
                  : 'rgba(0,0,0,0.12)',
            },
            zIndex: 1,
          }}
        >
          <ContentCopyIcon sx={{ fontSize: 10 }} />
        </IconButton>
      </Tooltip>
      <code ref={codeRef} className={className}>
        {children}
      </code>
    </Box>
  ) : (
    <code
      ref={codeRef}
      className={className}
      style={{
        background: 'linear-gradient(135deg, #f1f3f4 0%, #e8eaed 100%)',
        borderRadius: 3,
        padding: '2px 6px',
        fontSize: '12px',
        border: '1px solid #dadce0',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      {children}
    </code>
  );
};

const MarkdownParagraph: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box component="p" sx={{ m: 0, '&:not(:last-child)': { mb: 0.4 } }}>
    {children}
  </Box>
);

export const MessageRenderer: React.FC<MessageRendererProps> = ({
  content,
  role,
}) => {
  const Container = role === 'user' ? UserMessage : AssistantMessage;
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
  return (
    <Container>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: MarkdownCodeBlock,
          p: MarkdownParagraph,
        }}
      >
        {displayContent}
      </Markdown>
    </Container>
  );
};
