import type { InputState } from '../engine';

export type ExampleRow = Record<string, unknown>;

/** A read-only example dashboard bundled with the app. */
export interface ExamplePage {
  /** Starts with "example:" so it never collides with a stored page id. */
  id: string;
  title: string;
  description: string;
  routePath: string;
  markdown: string;
  /** Computes a SQL block's rows from the built-in sample data. */
  resolve: (queryName: string, inputs: InputState) => ExampleRow[];
}
