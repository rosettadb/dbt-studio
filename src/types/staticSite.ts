// Shared types for the Static Site build feature.
// Imported by both the renderer service/controller and the IPC handler.

export interface StaticSiteBuildOptions {
  connectionId: string;
  outputPath: string;
  overwrite: boolean;
}

export interface StaticSiteBuildResult {
  success: boolean;
  outputPath: string;
  pageCount: number;
  queryCount: number;
  error?: string;
}

export interface StaticSiteBuildProgress {
  phase: 'loading' | 'querying' | 'rendering' | 'writing' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
}

export interface StaticSiteState {
  connectionId: string;
  lastBuildPath: string;
  lastBuildAt: string;
  lastBuildPageCount: number;
  lastBuildQueryCount: number;
}
