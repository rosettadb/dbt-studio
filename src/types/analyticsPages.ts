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

// Mirrors Evidence's fileTree node — built from AnalyticsPage[] at render time
export interface AnalyticsTreeNode {
  label: string; // Display name (folder segment or page title)
  routePath: string | null; // null for folder nodes that are not pages themselves
  pageId: string | null; // null for pure folder nodes
  sidebarPosition?: number; // From Markdown frontmatter: sidebar_position
  sidebarBadge?: string; // From Markdown frontmatter: sidebar_badge
  children: AnalyticsTreeNode[];
}
