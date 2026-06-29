/**
 * Static Site Template Generator
 *
 * Generates HTML files for the exported static analytics site.
 * Each page embeds pre-executed query results as JSON and loads the
 * analytics runtime bundle from CDN-served React/MUI/Recharts.
 */

export interface StaticPageMeta {
  id: string;
  title: string;
  slug: string;
  routePath: string;
}

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

// ─── HTML safety helpers ─────────────────────────────────────────────────────
// Defined at top to satisfy no-use-before-define rule.

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Converts an analytics page title or route into a URL-safe slug */
export function toSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'page'
  );
}

/** Generate the index.html shell with sidebar navigation and iframe content area */
export function generateSiteShell(
  pages: StaticPageMeta[],
  connectionName: string,
  themeMode: 'light' | 'dark',
): string {
  const isDark = themeMode === 'dark';
  const bgColor = isDark ? '#121212' : '#fafafa';
  const sidebarBg = isDark ? '#1e1e1e' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#212121';
  const borderColor = isDark ? '#333' : '#e0e0e0';
  const hoverBg = isDark ? '#2a2a2a' : '#f5f5f5';
  const activeBg = isDark ? '#1565c0' : '#1976d2';

  const firstPage = pages[0];
  const firstSrc = firstPage ? `pages/${firstPage.slug}.html` : '';

  const navItems = pages
    .map(
      (p) =>
        `      <li><a href="pages/${p.slug}.html" data-slug="${p.slug}" title="${escapeAttr(p.title)}">${escapeHtml(p.title)}</a></li>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en" data-theme="${themeMode}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(connectionName)} — Analytics</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/site.css">
  <style>
    :root {
      --bg: ${bgColor};
      --sidebar-bg: ${sidebarBg};
      --text: ${textColor};
      --border: ${borderColor};
      --hover-bg: ${hoverBg};
      --active-bg: ${activeBg};
    }
  </style>
</head>
<body>
  <div id="app-shell">
    <nav id="sidebar">
      <div class="sidebar-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
        </svg>
        <span class="sidebar-title">${escapeHtml(connectionName)}</span>
      </div>
      <div class="sidebar-label">Analytics Pages</div>
      <ul class="page-list">
${navItems}
      </ul>
      <div class="sidebar-footer">Built with DBT Studio</div>
    </nav>
    <main id="content">
      <iframe id="page-frame" src="${firstSrc}" frameborder="0" title="Analytics Page"></iframe>
    </main>
  </div>
  <script>
    (function () {
      var frame = document.getElementById('page-frame');
      var links = document.querySelectorAll('.page-list a');
      function setActive(slug) {
        links.forEach(function (l) {
          l.classList.toggle('active', l.getAttribute('data-slug') === slug);
        });
      }
      if (links.length > 0) setActive(links[0].getAttribute('data-slug'));
      links.forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          var slug = link.getAttribute('data-slug');
          frame.src = link.getAttribute('href');
          setActive(slug);
        });
      });
    })();
  </script>
</body>
</html>`;
}

/** Generate the site.css asset for the shell layout */
export function generateSiteCSS(): string {
  return `/* DBT Studio Analytics — Static Site Shell Styles */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Roboto', sans-serif;
  background: var(--bg, #fafafa);
  color: var(--text, #212121);
  height: 100vh;
  overflow: hidden;
}

#app-shell {
  display: flex;
  height: 100vh;
}

#sidebar {
  width: 240px;
  min-width: 200px;
  max-width: 300px;
  background: var(--sidebar-bg, #ffffff);
  border-right: 1px solid var(--border, #e0e0e0);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border, #e0e0e0);
  font-weight: 600;
  font-size: 14px;
  color: var(--text, #212121);
}

.sidebar-label {
  padding: 10px 16px 4px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(128,128,128,0.8);
}

.page-list {
  list-style: none;
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.page-list li a {
  display: block;
  padding: 7px 16px;
  font-size: 13px;
  text-decoration: none;
  color: var(--text, #212121);
  border-radius: 4px;
  margin: 1px 8px;
  transition: background 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.page-list li a:hover { background: var(--hover-bg, #f5f5f5); }
.page-list li a.active {
  background: var(--active-bg, #1976d2);
  color: #ffffff;
}

.sidebar-footer {
  padding: 10px 16px;
  font-size: 11px;
  color: rgba(128,128,128,0.6);
  border-top: 1px solid var(--border, #e0e0e0);
}

#content { flex: 1; overflow: hidden; }

#page-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
`;
}

/** Generate an individual analytics page HTML file */
export function generatePageHtml(
  page: StaticPageMeta,
  data: StaticPageData,
): string {
  const serialized = JSON.stringify(data);
  const escapedTitle = escapeHtml(data.pageTitle || page.title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapedTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; font-family: 'Roboto', sans-serif; background: ${data.themeMode === 'dark' ? '#121212' : '#fafafa'}; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>

  <!-- Page Data (injected at build time) -->
  <script>window.__ANALYTICS_PAGE_DATA__ = ${serialized};</script>

  <!-- Analytics Runtime (self-contained bundle — React, MUI, Recharts all included) -->
  <script src="../assets/analytics-runtime.umd.js"></script>

  <!-- Mount -->
  <script>
    (function () {
      var container = document.getElementById('root');
      if (typeof AnalyticsRuntime !== 'undefined' && AnalyticsRuntime.mount) {
        AnalyticsRuntime.mount(container, window.__ANALYTICS_PAGE_DATA__);
      } else {
        container.innerHTML = '<div style="padding:32px;font-family:sans-serif;color:#d32f2f">' +
          '<h2>Runtime Error</h2>' +
          '<p>The analytics runtime bundle could not be loaded. ' +
          'Make sure <code>assets/analytics-runtime.umd.js</code> is present.</p>' +
          '</div>';
      }
    })();
  </script>
</body>
</html>`;
}

/** Generate a fallback index.html that redirects to the first page */
export function generateIndexRedirect(firstSlug: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0; url=pages/${firstSlug}.html">
  <title>Redirecting…</title>
</head>
<body>
  <p>Redirecting to <a href="pages/${firstSlug}.html">analytics pages</a>…</p>
</body>
</html>`;
}
