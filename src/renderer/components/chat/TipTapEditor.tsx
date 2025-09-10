import React from 'react';
import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

const EditorContainer = styled('div')(({ theme }) => ({
  position: 'relative',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius * 1.25,
  padding: theme.spacing(1, 1.25),
  minHeight: 64,
  maxHeight: 200,
  overflowY: 'auto',
  backgroundColor: theme.palette.background.paper,
  '& .ProseMirror': {
    outline: 'none',
    background: 'transparent',
    color: theme.palette.text.primary,
    fontFamily: theme.typography.fontFamily,
    fontSize: '13px' as any,
    lineHeight: 1.4,
    '& p': {
      margin: 0,
    },
  },
}));

interface TipTapEditorProps {
  value?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onSubmit?: () => void; // Enter to send (Shift+Enter for newline)
}

export const TipTapEditor: React.FC<TipTapEditorProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
  onSubmit,
}) => {
  const [focused, setFocused] = React.useState(false);
  const tiptapEditor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  React.useEffect(() => {
    if (
      tiptapEditor &&
      value !== undefined &&
      value !== tiptapEditor.getHTML()
    ) {
      tiptapEditor.commands.setContent(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Enter to send, Shift+Enter newline
  // Use EditorContent onKeyDown for reliability instead of DOM listener
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = tiptapEditor?.getText() || '';
        if (text.trim()) {
          onSubmit?.();
          // Keep focus after parent clears value
          setTimeout(() => tiptapEditor?.commands.focus('end'), 0);
        }
      }
      // StarterKit already maps Shift+Enter to hardBreak
    },
    [disabled, tiptapEditor, onSubmit],
  );

  // Paste as plain text (strip formatting)
  const handlePaste = React.useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text/plain');
      if (text) {
        e.preventDefault();
        tiptapEditor?.chain().focus().insertContent(text).run();
      }
    },
    [tiptapEditor],
  );

  // Auto-focus on mount (when enabled)
  React.useEffect(() => {
    if (!disabled) {
      tiptapEditor?.commands.focus('end');
    }
  }, [tiptapEditor, disabled]);
  return (
    <EditorContainer>
      <EditorContent
        editor={tiptapEditor}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {placeholder && !tiptapEditor?.getText() && !focused && (
        <Box
          sx={(theme) => ({
            position: 'absolute',
            top: theme.spacing(1), // match container vertical padding
            left: theme.spacing(1.25), // match container horizontal padding
            color: 'text.disabled',
            pointerEvents: 'none',
          })}
        >
          {placeholder}
        </Box>
      )}
    </EditorContainer>
  );
};
