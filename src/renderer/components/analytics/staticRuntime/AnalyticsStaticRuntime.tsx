/**
 * Analytics Static Runtime
 *
 * Entry point compiled to a UMD/IIFE bundle (analytics-runtime.umd.js) that
 * is embedded into every exported static analytics site page.
 *
 * React, ReactDOM, MUI, and Recharts are declared as EXTERNAL in esbuild
 * (see scripts/build-analytics-runtime.mjs). They are served from CDN
 * in the generated HTML and mapped to globals via the esbuild banner shim.
 *
 * Build: node scripts/build-analytics-runtime.mjs
 * Output: resources/analytics-runtime.umd.js
 */

/* eslint-disable @typescript-eslint/no-var-requires */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { AnalyticsPreview } from '../AnalyticsPreview';
import { AnalyticsPreviewErrorBoundary } from '../AnalyticsPreviewErrorBoundary';

export interface StaticPageData {
  pageTitle: string;
  markdown: string;
  queryResults: Record<string, any[]>;
  queryStatuses: Record<string, 'success' | 'error'>;
  queryErrors: Record<string, string | null>;
  themeMode: 'light' | 'dark';
  builtAt: string;
  truncated: Record<string, boolean>;
}

/**
 * Mount the analytics page into the given container element.
 * Called by each exported HTML page's inline <script> block:
 *
 *   AnalyticsRuntime.mount(document.getElementById('root'), window.__ANALYTICS_PAGE_DATA__);
 */
export function mount(container: HTMLElement, data: StaticPageData): void {
  try {
    const muiTheme = createTheme({
      palette: { mode: data.themeMode },
      typography: { fontFamily: 'Roboto, sans-serif' },
    });

    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <ThemeProvider theme={muiTheme}>
          <CssBaseline />
          <AnalyticsPreviewErrorBoundary>
            <AnalyticsPreview
              markdownContent={data.markdown}
              queryCache={data.queryResults}
              queryStatuses={
                data.queryStatuses as Record<
                  string,
                  'idle' | 'running' | 'success' | 'error'
                >
              }
              queryErrors={data.queryErrors}
              // Truncated flags are ignored in runtime since we don't fetch more rows
            />
          </AnalyticsPreviewErrorBoundary>
        </ThemeProvider>
      </React.StrictMode>,
    );
  } catch (err: any) {
    // eslint-disable-next-line no-param-reassign
    container.innerHTML = `
      <div style="padding:32px;font-family:Roboto,sans-serif;color:#d32f2f">
        <h2 style="margin:0 0 8px">Analytics Runtime Error</h2>
        <p style="margin:0;font-size:14px">${String(err?.message ?? 'Unknown error').replace(/</g, '&lt;')}</p>
      </div>`;
  }
}
