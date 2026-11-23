/* eslint-disable no-use-before-define -- the node types are mutually recursive */
/**
 * Analytics BI page model (Plan 97).
 *
 * React-free types shared by the renderer, the main process (static export,
 * agent tools) and the bundled static runtime.
 */

export type ParseWarningCode =
  | 'unclosed-component'
  | 'stray-closing-tag'
  | 'unclosed-logic'
  | 'stray-logic'
  | 'unknown-component'
  | 'unknown-prop'
  | 'missing-query'
  | 'duplicate-query'
  | 'bad-expression'
  | 'unnamed-input';

export interface ParseWarning {
  code: ParseWarningCode;
  message: string;
  line: number;
}

/** An attribute value exactly as written in the page. */
export type RawPropValue =
  | { kind: 'string'; value: string }
  | { kind: 'expr'; source: string }
  | { kind: 'flag' };

export interface RawProp {
  name: string;
  value: RawPropValue;
}

export interface SqlNode {
  type: 'sql';
  name: string;
  sql: string;
  lineStart: number;
  lineEnd: number;
}

export interface ComponentNode {
  type: 'component';
  /** Tag name as written (may be an alias). */
  tag: string;
  props: RawProp[];
  children: PageNode[];
  selfClosing: boolean;
  line: number;
}

export type MarkdownSlot =
  | { kind: 'expr'; source: string; raw: string }
  | { kind: 'component'; node: ComponentNode };

export interface MarkdownNode {
  type: 'markdown';
  /** Markdown with `<span data-bi-slot="N"></span>` placeholders. */
  source: string;
  slots: MarkdownSlot[];
  line: number;
}

export interface IfBranch {
  /** Condition source; undefined for the final `{:else}` branch. */
  condition?: string;
  children: PageNode[];
}

export interface IfNode {
  type: 'if';
  branches: IfBranch[];
  line: number;
}

export interface EachNode {
  type: 'each';
  expr: string;
  item: string;
  index?: string;
  children: PageNode[];
  line: number;
}

export type PageNode =
  | SqlNode
  | ComponentNode
  | MarkdownNode
  | IfNode
  | EachNode;

export interface Frontmatter {
  title?: string;
  engine?: string;
  description?: string;
  [key: string]: string | undefined;
}

export interface ParsedPage {
  frontmatter: Frontmatter;
  nodes: PageNode[];
  warnings: ParseWarning[];
}

/** Current value of one named input, as read by `${inputs.name.*}`. */
export interface InputValue {
  value: unknown;
  label?: unknown;
  start?: unknown;
  end?: unknown;
}

export type InputState = Record<string, InputValue>;

export type QueryStatus = 'idle' | 'running' | 'success' | 'error';
