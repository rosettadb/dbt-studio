import React, { useState } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import {
  Web,
  Edit,
  Delete,
  ChevronRight,
  ExpandMore,
} from '@mui/icons-material';
import type { AnalyticsTreeNode } from '../../../types/analyticsPages';

interface AnalyticsPageItemProps {
  node: AnalyticsTreeNode;
  depth: number;
  activePageId: string | null;
  onOpenPage: (pageId: string) => void;
  onRenamePage: (pageId: string, currentTitle: string) => void;
  onDeletePage: (pageId: string, title: string) => void;
  onContextMenu: (
    event: React.MouseEvent,
    pageId: string,
    title: string,
  ) => void;
}

export const AnalyticsPageItem: React.FC<AnalyticsPageItemProps> = ({
  node,
  depth,
  activePageId,
  onOpenPage,
  onRenamePage,
  onDeletePage,
  onContextMenu,
}) => {
  const [expanded, setExpanded] = useState(true);

  const hasChildren = node.children.length > 0;
  const isPage = node.pageId !== null;
  const isActive = isPage && node.pageId === activePageId;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPage) {
      onOpenPage(node.pageId!);
    } else if (hasChildren) {
      setExpanded(!expanded);
    }
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isPage) {
      onContextMenu(e, node.pageId!, node.label);
    }
  };

  return (
    <Box>
      <Box
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.5,
          pr: 1,
          pl: depth * 1.5 + 1,
          cursor: 'pointer',
          minHeight: '28px',
          borderLeft: isActive ? '2px solid' : '2px solid transparent',
          borderColor: isActive ? 'primary.main' : 'transparent',
          bgcolor: isActive ? 'action.selected' : 'transparent',
          '&:hover': {
            bgcolor: isActive ? 'action.selected' : 'action.hover',
            '& .hover-actions': {
              opacity: 1,
            },
          },
        }}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', width: '16px', mr: 0.5 }}
        >
          {hasChildren && expanded && (
            <ExpandMore
              sx={{
                fontSize: 16,
                color: 'text.secondary',
                cursor: 'pointer',
              }}
              onClick={handleToggleExpand}
            />
          )}
          {hasChildren && !expanded && (
            <ChevronRight
              sx={{
                fontSize: 16,
                color: 'text.secondary',
                cursor: 'pointer',
              }}
              onClick={handleToggleExpand}
            />
          )}
          {!hasChildren && isPage && (
            <Web sx={{ fontSize: 14, color: 'text.secondary', ml: '2px' }} />
          )}
        </Box>

        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontWeight: hasChildren && !isPage ? 600 : 400,
            fontSize: '0.85rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'text.primary',
          }}
        >
          {node.label}
        </Typography>

        {isPage && (
          <Box
            className="hover-actions"
            sx={{
              display: 'flex',
              alignItems: 'center',
              opacity: 0,
              transition: 'opacity 0.1s',
            }}
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onRenamePage(node.pageId!, node.label);
              }}
              sx={{ width: 20, height: 20, p: 0, mr: 0.5 }}
            >
              <Edit sx={{ fontSize: 14 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onDeletePage(node.pageId!, node.label);
              }}
              sx={{ width: 20, height: 20, p: 0 }}
            >
              <Delete sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        )}
      </Box>

      {hasChildren && expanded && (
        <Box>
          {node.children.map((childNode, index) => (
            <AnalyticsPageItem
              key={`${childNode.routePath}-${index}`}
              node={childNode}
              depth={depth + 1}
              activePageId={activePageId}
              onOpenPage={onOpenPage}
              onRenamePage={onRenamePage}
              onDeletePage={onDeletePage}
              onContextMenu={onContextMenu}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};
