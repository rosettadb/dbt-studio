import type {
  AnalyticsPage,
  AnalyticsTreeNode,
} from '../../types/analyticsPages';

function parseFrontmatter(markdown: string): Record<string, string | number> {
  const frontmatter: Record<string, string | number> = {};
  const lines = markdown.split('\n');
  if (lines.length > 0 && lines[0].trim() === '---') {
    let i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      const line = lines[i].trim();
      const separatorIndex = line.indexOf(':');
      if (separatorIndex > 0) {
        const key = line.substring(0, separatorIndex).trim();
        const valueStr = line.substring(separatorIndex + 1).trim();
        // remove surrounding quotes if any
        const value = valueStr.replace(/^['"](.*)['"]$/, '$1');

        // try to parse as number
        if (!Number.isNaN(Number(value)) && value !== '') {
          frontmatter[key] = Number(value);
        } else {
          frontmatter[key] = value;
        }
      }
      i += 1;
    }
  }
  return frontmatter;
}

function formatLabel(segment: string): string {
  return segment
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function buildAnalyticsTree(
  pages: AnalyticsPage[],
): AnalyticsTreeNode[] {
  const rootNodes: AnalyticsTreeNode[] = [];

  pages.forEach((page) => {
    const frontmatter = parseFrontmatter(page.markdownContent);
    const title =
      typeof frontmatter.title === 'string' ? frontmatter.title : null;
    const sidebarPosition =
      typeof frontmatter.sidebar_position === 'number'
        ? frontmatter.sidebar_position
        : undefined;
    const sidebarBadge =
      typeof frontmatter.sidebar_badge === 'string'
        ? frontmatter.sidebar_badge
        : undefined;

    // e.g. "/sales/sales-performance" -> ["sales", "sales-performance"]
    const segments = page.routePath.split('/').filter(Boolean);

    let currentLevel = rootNodes;
    let currentPath = '';

    segments.forEach((segment, i) => {
      currentPath += `/${segment}`;
      const isLeaf = i === segments.length - 1;

      // Fix no-loop-func: use a block-scoped const for the closure
      const thisPath = currentPath;
      let existingNode = currentLevel.find(
        (node) => node.routePath === thisPath,
      );

      if (!existingNode) {
        existingNode = {
          label: isLeaf && title ? title : formatLabel(segment),
          routePath: currentPath,
          pageId: isLeaf ? page.id : null,
          sidebarPosition: isLeaf ? sidebarPosition : undefined,
          sidebarBadge: isLeaf ? sidebarBadge : undefined,
          children: [],
        };
        currentLevel.push(existingNode);
      } else if (isLeaf) {
        // If the node already exists (e.g. created as a folder) but now we found a page for it
        existingNode.pageId = page.id;
        if (title) existingNode.label = title;
        if (sidebarPosition !== undefined)
          existingNode.sidebarPosition = sidebarPosition;
        if (sidebarBadge !== undefined)
          existingNode.sidebarBadge = sidebarBadge;
      }

      currentLevel = existingNode.children;
    });
  });

  // Recursive sorter
  function sortNodes(nodes: AnalyticsTreeNode[]) {
    nodes.sort((a, b) => {
      // 1. by sidebarPosition ascending
      if (a.sidebarPosition !== undefined && b.sidebarPosition !== undefined) {
        if (a.sidebarPosition !== b.sidebarPosition) {
          return a.sidebarPosition - b.sidebarPosition;
        }
      } else if (a.sidebarPosition !== undefined) {
        return -1;
      } else if (b.sidebarPosition !== undefined) {
        return 1;
      }

      // 2. alphabetically by label
      return a.label.localeCompare(b.label);
    });

    nodes.forEach((node) => {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  }

  sortNodes(rootNodes);

  return rootNodes;
}
