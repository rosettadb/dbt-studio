export interface AnalyticsPage {
  id: string;
  connectionId: string;
  title: string;
  routePath: string; // e.g., "/sales/monthly"
  markdownContent: string; // the raw Evidence-style markdown
  createdAt: string;
  updatedAt: string;
}

export type NewAnalyticsPage = Omit<
  AnalyticsPage,
  'id' | 'connectionId' | 'createdAt' | 'updatedAt'
>;

export type UpdateAnalyticsPage = Partial<
  Omit<AnalyticsPage, 'id' | 'connectionId' | 'createdAt'>
>;

// NOTE: AnalyticsCachedQuery is reserved for a future Phase 7 feature
// (persisting query results across page reloads). It is NOT used in Phases 1–6.
// Do NOT remove it — it is intentional forward-planning scaffolding.
export interface AnalyticsCachedQuery {
  id: string;
  pageId: string; // FK → AnalyticsPage.id
  queryName: string; // The code-block name: ```sql my_query
  sqlContent: string;
  lastRun: string | null;
  status: 'pending' | 'running' | 'success' | 'error';
  errorMessage?: string;
}
