import type { ComponentNode } from '../../shared/analyticsBi';

export type Row = Record<string, unknown>;

/** Props every registered analytics component receives. */
export interface BiImplProps {
  node: ComponentNode;
  /** Canonical component name. */
  tag: string;
  /** Attribute values keyed by canonical attribute name. */
  props: Record<string, unknown>;
  /** Rows from data={...}, when given. */
  data?: Row[];
  /** SQL block named by data={...}. */
  dataQuery?: string;
  /** Rendered inside a sentence. */
  inline: boolean;
}
