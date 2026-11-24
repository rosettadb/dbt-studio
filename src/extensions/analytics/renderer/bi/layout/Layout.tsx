/** Grid, Tabs/Tab, Accordion/AccordionItem, Alert, Details, Box and Stack. */
import React, { useState } from 'react';
import {
  Accordion as MuiAccordion,
  AccordionDetails,
  AccordionSummary,
  Alert as MuiAlert,
  AlertTitle,
  Box,
  Stack as MuiStack,
  Tab as MuiTab,
  Tabs as MuiTabs,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { canonicalComponentName, ComponentNode, PageNode } from '../engine';
import type { BiImplProps } from '../registry.types';
import { propBool, propNumber, propString, resolveComponent } from '../props';
import { NodeList } from '../NodeList';
import { useBiPage, useBiScope } from '../context';

const GAPS: Record<string, number> = { none: 0, sm: 1, md: 2, lg: 3 };

function childComponents(nodes: PageNode[], name: string): ComponentNode[] {
  return nodes.filter(
    (n): n is ComponentNode =>
      n.type === 'component' && canonicalComponentName(n.tag) === name,
  );
}

/** Children of a Grid: each component or markdown block is one cell. */
export const BiGrid: React.FC<BiImplProps> = ({ node, props }) => {
  const page = useBiPage();
  // Hidden SQL blocks must not take up a cell.
  const cells = node.children.filter(
    (child) => child.type !== 'sql' || page.showQueries,
  );
  const cols = Math.max(1, Math.min(6, propNumber(props, 'cols') ?? 2));
  const gapProp = props.gapSize;
  const gap =
    typeof gapProp === 'string' && gapProp in GAPS
      ? GAPS[gapProp]
      : (propNumber(props, 'gapSize') ?? 2);
  return (
    <Box
      data-testid="bi-grid"
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap,
        mb: 2,
        alignItems: 'stretch',
        // Stack the columns when the dashboard pane itself is narrow
        // (the page sets container-type, so this follows the pane, not the window).
        '@container bi-page (max-width: 720px)': {
          gridTemplateColumns: '1fr',
        },
        // Cards inside a cell fill the row height.
        '& > div > [data-testid="bi-chart"], & > div > [data-testid="bi-datatable"]':
          {
            height: '100%',
          },
      }}
    >
      {cells.map((child, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Box
          key={i}
          sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}
        >
          <NodeList nodes={[child]} />
        </Box>
      ))}
    </Box>
  );
};

export const BiTabs: React.FC<BiImplProps> = ({ node, props }) => {
  const page = useBiPage();
  const locals = useBiScope();
  const tabs = childComponents(node.children, 'Tab');
  const labels = tabs.map((tab, i) => {
    const p = resolveComponent(tab, page, locals).props;
    return propString(p, 'label') ?? `Tab ${i + 1}`;
  });
  const defaultTab = propString(props, 'defaultTab');
  const [active, setActive] = useState(() => {
    const index = defaultTab ? labels.indexOf(defaultTab) : -1;
    if (index >= 0) return index;
    const n = Number(defaultTab);
    return Number.isInteger(n) && n >= 0 && n < tabs.length ? n : 0;
  });
  const current = Math.min(active, Math.max(0, tabs.length - 1));
  if (tabs.length === 0) return <NodeList nodes={node.children} />;
  return (
    <Box sx={{ mb: 2 }} data-testid="bi-tabs">
      <MuiTabs
        value={current}
        onChange={(_, v: number) => setActive(v)}
        variant="scrollable"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36, mb: 2 }}
      >
        {labels.map((label, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <MuiTab
            key={i}
            label={label}
            sx={{ textTransform: 'none', minHeight: 36, py: 0.5 }}
          />
        ))}
      </MuiTabs>
      <NodeList nodes={tabs[current].children} />
    </Box>
  );
};

const AccordionSection: React.FC<{
  title: string;
  expanded: boolean;
  onChange: (open: boolean) => void;
  children: React.ReactNode;
}> = ({ title, expanded, onChange, children }) => (
  <MuiAccordion
    expanded={expanded}
    onChange={(_, open) => onChange(open)}
    disableGutters
    elevation={0}
    sx={{
      border: 1,
      borderColor: 'divider',
      '&:not(:last-of-type)': { borderBottom: 0 },
      '&::before': { display: 'none' },
    }}
  >
    <AccordionSummary expandIcon={<ExpandMore />}>
      <Typography variant="subtitle2">{title}</Typography>
    </AccordionSummary>
    <AccordionDetails>{children}</AccordionDetails>
  </MuiAccordion>
);

export const BiAccordion: React.FC<BiImplProps> = ({ node, props }) => {
  const page = useBiPage();
  const locals = useBiScope();
  const items = childComponents(node.children, 'AccordionItem');
  const single = propBool(props, 'single');
  const legacyTitle = propString(props, 'title');
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(propBool(props, 'defaultExpanded') ? [0] : []),
  );
  const toggle = (index: number, isOpen: boolean) =>
    setOpen((prev) => {
      const next = single ? new Set<number>() : new Set(prev);
      if (isOpen) next.add(index);
      else next.delete(index);
      return next;
    });

  // Old syntax: <Accordion title="..."> wraps content directly.
  if (items.length === 0) {
    return (
      <Box sx={{ mb: 2 }}>
        <AccordionSection
          title={legacyTitle ?? 'Details'}
          expanded={open.has(0)}
          onChange={(o) => toggle(0, o)}
        >
          <NodeList nodes={node.children} />
        </AccordionSection>
      </Box>
    );
  }
  return (
    <Box sx={{ mb: 2 }} data-testid="bi-accordion">
      {items.map((item, i) => (
        <AccordionSection
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          title={
            propString(resolveComponent(item, page, locals).props, 'title') ??
            `Section ${i + 1}`
          }
          expanded={open.has(i)}
          onChange={(o) => toggle(i, o)}
        >
          <NodeList nodes={item.children} />
        </AccordionSection>
      ))}
    </Box>
  );
};

const ALERT_SEVERITY: Record<string, 'info' | 'success' | 'warning' | 'error'> =
  {
    info: 'info',
    positive: 'success',
    success: 'success',
    warning: 'warning',
    negative: 'error',
    error: 'error',
  };

export const BiAlert: React.FC<BiImplProps> = ({ node, props }) => {
  const severity =
    ALERT_SEVERITY[propString(props, 'status') ?? 'info'] ?? 'info';
  const title = propString(props, 'title');
  return (
    <MuiAlert
      severity={severity}
      sx={{ mb: 2, '& p:last-child': { mb: 0 } }}
      data-testid="bi-alert"
    >
      {title && <AlertTitle>{title}</AlertTitle>}
      <NodeList nodes={node.children} />
    </MuiAlert>
  );
};

export const BiDetails: React.FC<BiImplProps> = ({ node, props }) => (
  <Box
    component="details"
    open={propBool(props, 'open')}
    sx={{
      mb: 2,
      '& > summary': {
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '0.875rem',
        mb: 1,
      },
    }}
    data-testid="bi-details"
  >
    <summary>{propString(props, 'title') ?? 'Details'}</summary>
    <NodeList nodes={node.children} />
  </Box>
);

export const BiBox: React.FC<BiImplProps> = ({ node, props }) => (
  <Box
    sx={{
      width: props.width as string | number | undefined,
      height: props.height as string | number | undefined,
      bgcolor: propString(props, 'bgcolor'),
      p: propNumber(props, 'p') ?? 0,
      m: propNumber(props, 'm') ?? 0,
    }}
  >
    <NodeList nodes={node.children} />
  </Box>
);

export const BiStack: React.FC<BiImplProps> = ({ node, props }) => (
  <MuiStack
    direction={propString(props, 'direction') === 'row' ? 'row' : 'column'}
    spacing={propNumber(props, 'spacing') ?? 1}
    sx={{ mb: 2 }}
  >
    {node.children.map((child, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <Box key={i} sx={{ minWidth: 0 }}>
        <NodeList nodes={[child]} />
      </Box>
    ))}
  </MuiStack>
);
