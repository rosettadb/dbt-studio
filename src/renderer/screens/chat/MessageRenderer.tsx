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
  backgroundColor:
    theme.palette.mode === 'dark'
      ? theme.palette.background.paper
      : theme.palette.background.paper,
  borderRadius: 12,
  padding: theme.spacing(1),
  marginBottom: theme.spacing(0.75),
  maxWidth: 'min(75%, 720px)',
  wordBreak: 'break-word',
  boxShadow:
    theme.palette.mode === 'dark'
      ? '0 1px 2px rgba(0,0,0,0.4)'
      : '0 1px 2px rgba(0,0,0,0.08)',
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
  backgroundColor:
    theme.palette.mode === 'dark'
      ? theme.palette.background.paper
      : theme.palette.grey[50],
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
        background: '#222',
        color: '#fff',
        p: 1,
        borderRadius: 1,
        overflowX: 'auto',
        position: 'relative',
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
            bgcolor: 'rgba(255,255,255,0.08)',
            color: 'white',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' },
          }}
        >
          <ContentCopyIcon fontSize="inherit" />
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
        background: '#eee',
        borderRadius: 4,
        padding: '0 4px',
      }}
    >
      {children}
    </code>
  );
};

const MarkdownParagraph: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box component="p" sx={{ m: 0, '&:not(:last-child)': { mb: 0.5 } }}>
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

export default MessageRenderer;
