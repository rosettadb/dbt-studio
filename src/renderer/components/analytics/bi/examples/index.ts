/**
 * Read-only example dashboards shown under "Examples" in the Analytics page
 * list. They are bundled with the app (not stored in the database) and run
 * on built-in sample data, so they work without any connection.
 */
import type { InputState } from '../engine';
import type { QueryExecutionResult } from '../../../../utils/analyticsQueryEngine';
import { salesOverview } from './salesOverview';
import { supportOperations } from './supportOperations';
import { productAnalytics } from './productAnalytics';
import type { ExamplePage } from './types';

export type { ExamplePage } from './types';

export const EXAMPLE_PAGES: ExamplePage[] = [
  salesOverview,
  supportOperations,
  productAnalytics,
];

export const EXAMPLE_ID_PREFIX = 'example:';

export function isExamplePageId(pageId: string | null | undefined): boolean {
  return Boolean(pageId && pageId.startsWith(EXAMPLE_ID_PREFIX));
}

export function getExamplePage(
  pageId: string | null | undefined,
): ExamplePage | undefined {
  return EXAMPLE_PAGES.find((p) => p.id === pageId);
}

/** Runs an example's SQL block against the built-in sample data. */
export async function executeExampleQuery(
  example: ExamplePage,
  params: { queryName: string; inputs: InputState },
): Promise<QueryExecutionResult> {
  const started =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const data = example.resolve(params.queryName, params.inputs);
    const ended =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      name: params.queryName,
      status: 'success',
      data,
      fields: data.length ? Object.keys(data[0]) : [],
      rowCount: data.length,
      duration: ended - started,
    };
  } catch (error) {
    return {
      name: params.queryName,
      status: 'error',
      data: [],
      fields: [],
      rowCount: 0,
      error: (error as Error).message,
    };
  }
}

/**
 * Markdown for a user's copy of an example: same page, minus the
 * "read-only example" notice, with a note to point the SQL at real tables.
 */
export function duplicateMarkdown(example: ExamplePage, title: string): string {
  const withoutNotice = example.markdown.replace(
    /<Alert status="info" title="Example dashboard \(read-only\)">[\s\S]*?<\/Alert>\n*/,
    '',
  );
  const body = withoutNotice.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const safeTitle = title.replace(/"/g, '\\"').replace(/\n/g, ' ');
  return `---
title: "${safeTitle}"
---

<!-- Copied from the "${example.title}" example. The SQL expects tables named like the
     sample data (orders, tickets, accounts); change it to read your own tables. -->

${body}`;
}

const OPEN_PAGE_EVENT = 'dbt-studio:analytics-open-page';

/** Ask the Analytics page list to open a page (e.g. a new copy of an example). */
export function requestOpenAnalyticsPage(pageId: string): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_PAGE_EVENT, { detail: { pageId } }),
  );
}

export function onOpenAnalyticsPageRequest(
  handler: (pageId: string) => void,
): () => void {
  const listener = (event: Event) => {
    const pageId = (event as CustomEvent<{ pageId?: string }>).detail?.pageId;
    if (pageId) handler(pageId);
  };
  window.addEventListener(OPEN_PAGE_EVENT, listener);
  return () => window.removeEventListener(OPEN_PAGE_EVENT, listener);
}
