/**
 * Markdown formatting toolbar for the notebook text cell (Colab-style).
 * Each button inserts markdown syntax into the textarea via `onFormat`; the
 * cell itself stays plain markdown.
 */

import React from 'react';
import { Box, Divider, IconButton, Tooltip } from '@mui/material';
import {
  Code,
  DataObject,
  FormatBold,
  FormatItalic,
  FormatListBulleted,
  FormatListNumbered,
  FormatQuote,
  FormatStrikethrough,
  HorizontalRule,
  Image as ImageIcon,
  Link as LinkIcon,
  Title,
} from '@mui/icons-material';
import type { MarkdownFormatAction } from './markdownFormatting';

interface ToolbarItem {
  action: MarkdownFormatAction;
  label: string;
  icon: React.ReactNode;
}

const ICON_SX = { fontSize: 16 } as const;

const GROUPS: ToolbarItem[][] = [
  [
    { action: 'bold', label: 'Bold (⌘B)', icon: <FormatBold sx={ICON_SX} /> },
    {
      action: 'italic',
      label: 'Italic (⌘I)',
      icon: <FormatItalic sx={ICON_SX} />,
    },
    {
      action: 'strikethrough',
      label: 'Strikethrough',
      icon: <FormatStrikethrough sx={ICON_SX} />,
    },
    { action: 'code', label: 'Inline code', icon: <Code sx={ICON_SX} /> },
    {
      action: 'codeBlock',
      label: 'Code block',
      icon: <DataObject sx={ICON_SX} />,
    },
  ],
  [
    { action: 'heading', label: 'Heading', icon: <Title sx={ICON_SX} /> },
    {
      action: 'bulletList',
      label: 'Bulleted list',
      icon: <FormatListBulleted sx={ICON_SX} />,
    },
    {
      action: 'numberedList',
      label: 'Numbered list',
      icon: <FormatListNumbered sx={ICON_SX} />,
    },
    { action: 'quote', label: 'Quote', icon: <FormatQuote sx={ICON_SX} /> },
    {
      action: 'horizontalRule',
      label: 'Horizontal rule',
      icon: <HorizontalRule sx={ICON_SX} />,
    },
  ],
  [
    { action: 'link', label: 'Link (⌘K)', icon: <LinkIcon sx={ICON_SX} /> },
    { action: 'image', label: 'Image', icon: <ImageIcon sx={ICON_SX} /> },
  ],
];

interface MarkdownToolbarProps {
  onFormat: (action: MarkdownFormatAction) => void;
}

export const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({
  onFormat,
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.25,
      px: 1,
      py: 0.25,
      borderBottom: '1px solid',
      borderColor: 'divider',
    }}
    role="toolbar"
    aria-label="Markdown formatting"
    data-testid="markdown-toolbar"
  >
    {GROUPS.map((group, groupIndex) => (
      // eslint-disable-next-line react/no-array-index-key
      <React.Fragment key={groupIndex}>
        {groupIndex > 0 && (
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
        )}
        {group.map(({ action, label, icon }) => (
          <Tooltip key={action} title={label}>
            <IconButton
              size="small"
              aria-label={label}
              // Keep the textarea focused (and its selection) while clicking
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onFormat(action)}
              data-testid={`markdown-format-${action}`}
            >
              {icon}
            </IconButton>
          </Tooltip>
        ))}
      </React.Fragment>
    ))}
  </Box>
);

export default MarkdownToolbar;
