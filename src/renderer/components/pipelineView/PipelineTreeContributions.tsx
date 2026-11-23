import React from 'react';
import { IconButton } from '@mui/material';
import { PlayArrow as PlayIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { isFileUnpushed } from '../../services/git.service';
import { path, toPosix } from '../../lib/path';
import { useGetSettings } from '../../controllers';
import { PipelineThumbnailPreview } from '../fileTreeViewer/PipelineThumbnailPreview';
import type {
  FileTreeHoverPreview,
  FileTreeRow,
  FileTreeRowAction,
} from '../../../extensionApi/renderer';
import { isPipelineFile } from './parsePipelineConfig';
import {
  getPipelineRelativeName,
  getPipelineRelativePath,
} from './getPipelineRelativeName';
import { pipelineRunStore } from './pipelineRunStore';

const isPipelineRow = (row: FileTreeRow): boolean =>
  !row.isFolder && isPipelineFile(row.path);

// "Run Pipeline" on a pipeline's row, when Studio runs things on the cloud.
const CloudRunAction: React.FC<FileTreeRow> = ({
  path: filePath,
  projectPath,
  gitStatus,
}) => {
  const { data: settings } = useGetSettings();
  const isAvailable =
    settings?.env === 'cloud' && !settings?.dbtVersion?.startsWith('2.');
  if (!isAvailable) return null;

  return (
    <IconButton
      size="small"
      onClick={async (e) => {
        e.stopPropagation();
        if (gitStatus) {
          toast.error(
            `Pipeline has uncommitted changes (${gitStatus}). Commit and push before running.`,
          );
          return;
        }
        // Check for unpushed commits (git wants a `/`-separated path
        // relative to the repo root)
        const relativePath = toPosix(path.relative(projectPath, filePath));
        try {
          const unpushed = await isFileUnpushed(projectPath, relativePath);
          if (unpushed) {
            toast.error(
              'Pipeline has unpushed changes. Push your commits before running on cloud.',
            );
            return;
          }
        } catch {
          // If check fails, allow proceeding
        }
        pipelineRunStore.requestCloudRun(
          `--pipeline_name ${getPipelineRelativeName(filePath, projectPath)}`,
        );
      }}
      title={
        gitStatus
          ? `Pipeline has uncommitted changes (${gitStatus})`
          : 'Run Pipeline'
      }
      sx={{ padding: '4px', color: 'success.main', flexShrink: 0 }}
    >
      <PlayIcon sx={{ fontSize: 16 }} />
    </IconButton>
  );
};

// "Run Pipeline (Local Runner)" on a pipeline's row, when Studio runs
// things on this machine and the runner is installed.
const LocalRunAction: React.FC<FileTreeRow> = ({
  path: filePath,
  projectPath,
}) => {
  const { data: settings } = useGetSettings();
  const isAvailable =
    settings?.env !== 'cloud' &&
    !settings?.dbtVersion?.startsWith('2.') &&
    !!settings?.runnerPath;
  if (!isAvailable) return null;

  return (
    <IconButton
      size="small"
      onClick={(e) => {
        e.stopPropagation();
        pipelineRunStore.requestLocalRun(
          getPipelineRelativePath(filePath, projectPath),
        );
      }}
      title="Run Pipeline (Local Runner)"
      sx={{ padding: '4px', color: 'success.main', flexShrink: 0 }}
    >
      <PlayIcon sx={{ fontSize: 16 }} />
    </IconButton>
  );
};

export const pipelineCloudRunRowAction: FileTreeRowAction = {
  id: 'pipeline.run-cloud',
  order: 100,
  when: isPipelineRow,
  Component: CloudRunAction,
};

export const pipelineLocalRunRowAction: FileTreeRowAction = {
  id: 'pipeline.run-local',
  order: 200,
  when: isPipelineRow,
  Component: LocalRunAction,
};

// The small picture of the pipeline shown when the pointer rests on its row.
const ThumbnailPreview: React.FC<FileTreeRow> = ({ path: filePath }) => (
  <PipelineThumbnailPreview filePath={filePath} />
);

export const pipelineHoverPreview: FileTreeHoverPreview = {
  id: 'pipeline.thumbnail',
  when: isPipelineRow,
  Component: ThumbnailPreview,
};
