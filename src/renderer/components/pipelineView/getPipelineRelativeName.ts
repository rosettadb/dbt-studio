import { path as nodePath, toPosix, isInside } from '../../lib/path';
import {
  LEGACY_PIPELINE_CONFIG_DIR,
  PIPELINE_CONFIG_DIR,
  PIPELINE_CONFIG_PARENT_DIR,
} from './parsePipelineConfig';

/**
 * Resolves a pipeline file's identifier relative to whichever pipelines base
 * directory it lives under (`rosetta/pipelines/` current, `.rosetta/`
 * legacy), extension stripped — matching the `name` the main process reports
 * from `ProjectsService.listPipelines`. Falls back to the bare filename if
 * the file isn't under a known base dir. This is what must be sent as
 * `PIPELINE_FILE` and used as the `pipelineRuns` lookup key so nested
 * pipelines don't collide with same-named pipelines in other folders.
 */
export const getPipelineRelativeName = (
  filePath: string,
  projectPath: string,
): string => {
  const baseDirs = [
    nodePath.join(projectPath, PIPELINE_CONFIG_PARENT_DIR, PIPELINE_CONFIG_DIR),
    nodePath.join(projectPath, LEGACY_PIPELINE_CONFIG_DIR),
  ];

  const base = baseDirs.find(
    (dir) => nodePath.relative(dir, filePath) !== '' && isInside(dir, filePath),
  );
  const relative = base
    ? toPosix(nodePath.relative(base, filePath))
    : nodePath.basename(filePath);

  return relative.replace(/\.(yml|yaml)$/, '');
};

/**
 * Relative pipeline path with its real extension (e.g. `test/test.yaml`) —
 * what the local runner is given, and the key a local run's task id is
 * derived from.
 */
export const getPipelineRelativePath = (
  filePath: string,
  projectPath: string,
): string =>
  `${getPipelineRelativeName(filePath, projectPath)}${filePath.slice(
    filePath.lastIndexOf('.'),
  )}`;

/**
 * Identifier matching the PIPELINE_FILE sent to the cloud and the key used in
 * `project.pipelineRuns` (always `.yml`, regardless of on-disk extension).
 */
export const getPipelineCloudFile = (
  filePath: string,
  projectPath: string,
): string => `${getPipelineRelativeName(filePath, projectPath)}.yml`;
