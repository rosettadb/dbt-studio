import React from 'react';
import {
  Divider,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  ContentCopy,
  Code,
  DriveFileRenameOutline,
  Input,
  PlayArrow,
  Refresh,
} from '@mui/icons-material';
import type { SchemaTreeNodeRef } from './types';

export type SchemaTreeMenuAction =
  | 'insert-name'
  | 'copy-name'
  | 'copy-qualified-name'
  | 'copy-columns'
  | 'generate-select'
  | 'generate-select-columns'
  | 'generate-count'
  | 'generate-insert'
  | 'generate-select-column'
  | 'generate-select-distinct'
  | 'generate-count-by'
  | 'preview'
  | 'rename'
  | 'refresh';

export type SchemaTreeContextMenuState = {
  mouseX: number;
  mouseY: number;
  node: SchemaTreeNodeRef;
} | null;

export type SchemaTreeMenuCapabilities = {
  /** Host can insert text into an editor (enables Insert / Generate items). */
  insert?: boolean;
  /** Host can run SQL and show results (enables Preview data). */
  preview?: boolean;
  /** Host can rename this node (enables Rename). */
  rename?: boolean;
  /** Host can refresh the schema. */
  refresh?: boolean;
};

type Props = {
  state: SchemaTreeContextMenuState;
  onClose: () => void;
  onAction: (action: SchemaTreeMenuAction, node: SchemaTreeNodeRef) => void;
  capabilities?: SchemaTreeMenuCapabilities;
};

type Entry =
  | {
      type: 'item';
      action: SchemaTreeMenuAction;
      label: string;
      icon: React.ReactNode;
    }
  | { type: 'divider' }
  | { type: 'header'; label: string };

const item = (
  action: SchemaTreeMenuAction,
  label: string,
  icon: React.ReactNode,
): Entry => ({ type: 'item', action, label, icon });
const divider = (): Entry => ({ type: 'divider' });
const header = (label: string): Entry => ({ type: 'header', label });

const copyIcon = <ContentCopy fontSize="small" />;
const codeIcon = <Code fontSize="small" />;

const buildEntries = (
  node: SchemaTreeNodeRef,
  caps: SchemaTreeMenuCapabilities,
): Entry[] => {
  const entries: Entry[] = [];
  const push = (...items: Entry[]) => entries.push(...items);

  switch (node.kind) {
    case 'database':
      push(item('copy-name', 'Copy name', copyIcon));
      break;

    case 'schema':
      if (caps.insert) {
        push(item('insert-name', 'Insert name', <Input fontSize="small" />));
      }
      push(item('copy-name', 'Copy name', copyIcon));
      break;

    case 'table':
    case 'view': {
      if (caps.insert) {
        push(item('insert-name', 'Insert name', <Input fontSize="small" />));
      }
      push(
        item('copy-name', 'Copy name', copyIcon),
        item('copy-qualified-name', 'Copy qualified name', copyIcon),
      );
      if (node.columns && node.columns.length > 0) {
        push(item('copy-columns', 'Copy column list', copyIcon));
      }
      if (caps.insert) {
        push(
          divider(),
          header('Generate SQL'),
          item('generate-select', 'SELECT *', codeIcon),
        );
        if (node.columns && node.columns.length > 0) {
          push(item('generate-select-columns', 'SELECT columns', codeIcon));
        }
        push(item('generate-count', 'COUNT(*)', codeIcon));
        if (node.kind === 'table') {
          push(item('generate-insert', 'INSERT template', codeIcon));
        }
      }
      if (caps.preview) {
        push(
          divider(),
          item('preview', 'Preview data', <PlayArrow fontSize="small" />),
        );
      }
      if (caps.rename) {
        push(
          divider(),
          item(
            'rename',
            node.kind === 'view' ? 'Rename view' : 'Rename table',
            <DriveFileRenameOutline fontSize="small" />,
          ),
        );
      }
      break;
    }

    case 'column':
      if (caps.insert) {
        push(item('insert-name', 'Insert name', <Input fontSize="small" />));
      }
      push(
        item('copy-name', 'Copy name', copyIcon),
        item('copy-qualified-name', 'Copy qualified name', copyIcon),
      );
      if (caps.insert) {
        push(
          divider(),
          header('Generate SQL'),
          item('generate-select-column', 'SELECT column', codeIcon),
          item('generate-select-distinct', 'SELECT DISTINCT', codeIcon),
          item('generate-count-by', 'COUNT(*) GROUP BY', codeIcon),
        );
      }
      if (caps.rename) {
        push(
          divider(),
          item(
            'rename',
            'Rename column',
            <DriveFileRenameOutline fontSize="small" />,
          ),
        );
      }
      break;

    default:
      break;
  }

  if (caps.refresh) {
    push(
      divider(),
      item('refresh', 'Refresh schema', <Refresh fontSize="small" />),
    );
  }

  return entries;
};

/**
 * Right-click menu for Data tree nodes. Purely presentational: it decides
 * which entries to show from the node kind and host capabilities, and reports
 * the chosen action through `onAction`.
 */
export const SchemaTreeContextMenu: React.FC<Props> = ({
  state,
  onClose,
  onAction,
  capabilities = {},
}) => {
  const entries = React.useMemo(
    () => (state ? buildEntries(state.node, capabilities) : []),
    [state, capabilities],
  );

  const handleClick = (action: SchemaTreeMenuAction) => {
    if (!state) return;
    const { node } = state;
    onClose();
    onAction(action, node);
  };

  return (
    <Menu
      open={state !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        state !== null ? { top: state.mouseY, left: state.mouseX } : undefined
      }
      slotProps={{ paper: { sx: { minWidth: 200 } } }}
      MenuListProps={{ dense: true, 'aria-label': 'Schema object actions' }}
      data-testid="schema-tree-context-menu"
    >
      {entries.map((entry, index) => {
        if (entry.type === 'divider') {
          // eslint-disable-next-line react/no-array-index-key
          return <Divider key={`divider-${index}`} />;
        }
        if (entry.type === 'header') {
          return (
            <ListSubheader
              key={`header-${entry.label}`}
              disableSticky
              sx={{ lineHeight: '28px', fontSize: '0.7rem' }}
            >
              {entry.label}
            </ListSubheader>
          );
        }
        return (
          <MenuItem
            key={entry.action}
            onClick={() => handleClick(entry.action)}
            data-testid={`schema-tree-menu-${entry.action}`}
            sx={{ fontSize: '0.8rem', py: 0.5, px: 1.5 }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>{entry.icon}</ListItemIcon>
            <ListItemText
              primary={entry.label}
              primaryTypographyProps={{ fontSize: '0.8rem' }}
            />
          </MenuItem>
        );
      })}
    </Menu>
  );
};
