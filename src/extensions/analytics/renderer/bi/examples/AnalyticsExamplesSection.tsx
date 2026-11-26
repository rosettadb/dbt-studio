/**
 * "Examples" group in the Analytics page list: read-only dashboards whose
 * markdown shows how the page language works.
 */
import React, { useEffect, useState } from 'react';
import {
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ExpandLess,
  ExpandMore,
  AutoStoriesOutlined,
  LockOutlined,
} from '@mui/icons-material';
import { EXAMPLE_PAGES, onOpenAnalyticsPageRequest } from './index';

export const AnalyticsExamplesSection: React.FC<{
  activePageId: string | null;
  onOpenPage: (pageId: string) => void;
}> = ({ activePageId, onOpenPage }) => {
  const [open, setOpen] = useState(true);
  // Opens the copy after "Duplicate to my pages" in the editor.
  useEffect(() => onOpenAnalyticsPageRequest(onOpenPage), [onOpenPage]);
  return (
    <Box
      sx={{ mt: 1, borderTop: 1, borderColor: 'divider', pt: 0.5 }}
      data-testid="analytics-examples"
    >
      <ListItemButton dense onClick={() => setOpen((o) => !o)} sx={{ px: 2 }}>
        <ListItemIcon sx={{ minWidth: 28 }}>
          <AutoStoriesOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography
              variant="caption"
              fontWeight={600}
              color="text.secondary"
            >
              Examples
            </Typography>
          }
        />
        {open ? (
          <ExpandLess sx={{ fontSize: 16 }} />
        ) : (
          <ExpandMore sx={{ fontSize: 16 }} />
        )}
      </ListItemButton>
      <Collapse in={open}>
        <List dense disablePadding>
          {EXAMPLE_PAGES.map((example) => (
            <Tooltip
              key={example.id}
              title={example.description}
              placement="right"
            >
              <ListItemButton
                selected={activePageId === example.id}
                onClick={() => onOpenPage(example.id)}
                sx={{ pl: 4.5, pr: 2, py: 0.25 }}
              >
                <ListItemText
                  primary={example.title}
                  primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
                />
                <LockOutlined
                  sx={{ fontSize: 12, color: 'text.disabled', ml: 1 }}
                  aria-label="Read-only"
                />
              </ListItemButton>
            </Tooltip>
          ))}
        </List>
      </Collapse>
    </Box>
  );
};
