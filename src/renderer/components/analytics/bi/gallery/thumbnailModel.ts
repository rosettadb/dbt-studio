/**
 * Turns a page's markdown into a simple wireframe layout for its gallery
 * card: text lines, KPI tiles, filters, chart glyphs and table rows, in the
 * order they appear on the page. No queries run.
 */
import {
  canonicalComponentName,
  ComponentNode,
  PageNode,
  parsePage,
} from '../engine';

export type ChartGlyph = 'bar' | 'hbar' | 'line' | 'area' | 'scatter' | 'pie';

export type ThumbBlock =
  | { kind: 'title' }
  | { kind: 'heading' }
  | { kind: 'text'; lines: number }
  | { kind: 'alert' }
  | { kind: 'kpis'; count: number }
  | { kind: 'filters'; count: number }
  | { kind: 'chart'; glyph: ChartGlyph }
  | { kind: 'table'; rows: number }
  | { kind: 'columns'; cells: ThumbBlock[][] };

const INPUTS = new Set([
  'Dropdown',
  'ButtonGroup',
  'DateRange',
  'TextInput',
  'NumberInput',
  'Checkbox',
  'Slider',
]);

function chartGlyph(node: ComponentNode, name: string): ChartGlyph | null {
  const swap = node.props.some(
    (p) =>
      (p.name === 'swapXY' || p.name === 'swap_xy') &&
      p.value.kind !== 'string',
  );
  switch (name) {
    case 'BarChart':
      return swap || node.tag === 'HorizontalBarChart' ? 'hbar' : 'bar';
    case 'LineChart':
      return 'line';
    case 'AreaChart':
      return 'area';
    case 'ScatterPlot':
      return 'scatter';
    case 'PieChart':
    case 'DonutChart':
      return 'pie';
    default:
      return null;
  }
}

function blocksFor(nodes: PageNode[], depth: number): ThumbBlock[] {
  const out: ThumbBlock[] = [];
  const push = (block: ThumbBlock) => {
    const last = out[out.length - 1];
    if (block.kind === 'kpis' && last?.kind === 'kpis') last.count += 1;
    else if (block.kind === 'filters' && last?.kind === 'filters')
      last.count += 1;
    else out.push(block);
  };

  nodes.forEach((node) => {
    if (node.type === 'markdown') {
      node.source.split('\n').forEach((line) => {
        const t = line.trim();
        if (!t) return;
        if (/^#{1,3}\s/.test(t)) push({ kind: 'heading' });
        else {
          const last = out[out.length - 1];
          if (last?.kind === 'text') last.lines = Math.min(last.lines + 1, 4);
          else push({ kind: 'text', lines: 1 });
        }
      });
      return;
    }
    if (node.type === 'if') {
      if (node.branches[0])
        out.push(...blocksFor(node.branches[0].children, depth));
      return;
    }
    if (node.type === 'each') {
      push({ kind: 'text', lines: 2 });
      return;
    }
    if (node.type !== 'component') return;
    const name = canonicalComponentName(node.tag) ?? '';
    if (name === 'BigValue') push({ kind: 'kpis', count: 1 });
    else if (INPUTS.has(name)) push({ kind: 'filters', count: 1 });
    else if (name === 'DataTable') push({ kind: 'table', rows: 4 });
    else if (name === 'Alert') push({ kind: 'alert' });
    else if (name === 'Grid' && depth < 1) {
      const cells = node.children
        .filter((c) => c.type !== 'sql')
        .map((c) => blocksFor([c], depth + 1))
        .filter((c) => c.length > 0);
      if (cells.length) push({ kind: 'columns', cells });
    } else if ((name === 'Tabs' || name === 'Accordion') && depth < 1) {
      const first = node.children.find((c) => c.type === 'component') as
        | ComponentNode
        | undefined;
      if (first) out.push(...blocksFor(first.children, depth + 1));
    } else {
      const glyph = chartGlyph(node, name);
      if (glyph) push({ kind: 'chart', glyph });
    }
  });
  return out;
}

/** Wireframe for a page; capped so cards stay a similar height. */
export function buildThumbnail(markdown: string, maxBlocks = 7): ThumbBlock[] {
  try {
    const page = parsePage(markdown);
    // Favour the visual parts: no alerts or headings, at most one text block.
    let textSeen = false;
    const blocks = blocksFor(page.nodes, 0).filter((b) => {
      if (b.kind === 'alert' || b.kind === 'heading') return false;
      if (b.kind === 'text') {
        if (textSeen) return false;
        textSeen = true;
      }
      return true;
    });
    const withTitle: ThumbBlock[] = page.frontmatter.title
      ? [{ kind: 'title' }, ...blocks]
      : blocks;
    return withTitle.slice(0, maxBlocks);
  } catch {
    return [{ kind: 'title' }, { kind: 'text', lines: 2 }];
  }
}

/** Deterministic pseudo-random series for glyphs (same page → same picture). */
/* eslint-disable no-bitwise -- 32-bit string hash for a stable seed */
export function seededSeries(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  const out: number[] = [];
  let v = 0.4;
  for (let i = 0; i < n; i += 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    v = Math.max(0.12, Math.min(1, v + (r - 0.42) * 0.35));
    out.push(v);
  }
  return out;
}
/* eslint-enable no-bitwise */
