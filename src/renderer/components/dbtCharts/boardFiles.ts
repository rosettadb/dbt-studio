const normalize = (p: string) => p.replace(/\\/g, '/');

/** Path of a file relative to the project root, or null when outside it. */
export const toProjectRelativePath = (
  projectPath: string,
  filePath: string,
): string | null => {
  const root = normalize(projectPath).replace(/\/+$/, '');
  const file = normalize(filePath);
  if (file === root || !file.startsWith(`${root}/`)) return null;
  return file.slice(root.length + 1);
};

/**
 * A board is a .yml/.yaml file under {project}/charts/ (any depth).
 * dbt_charts.yml in the project root is configuration, not a board.
 */
export const isChartBoardFile = (
  projectPath: string,
  filePath: string,
): boolean => {
  if (!projectPath || !filePath) return false;
  const rel = toProjectRelativePath(projectPath, filePath);
  return rel !== null && /^charts\/.+\.ya?ml$/i.test(rel);
};
