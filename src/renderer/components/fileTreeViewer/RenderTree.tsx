import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import {
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import { MoreVert, PlayArrow, Speed } from '@mui/icons-material';
import { TreeItems } from './TreeItems';
import { FileNode } from '../../../types/backend';
import { ActionsContainer, LabelContainer } from './styles';
import { projectsServices } from '../../services';

type Props = {
  node: FileNode;
  fileStatuses: Record<string, string>;
  onFileSelect: (file: FileNode) => void;
  onDelete: (path: string) => void;
  onNewFolder: (path: string) => void;
  onNewFile: (path: string) => void;
  onDbtRun: (file: FileNode) => Promise<void>;
  onDbtTest: (file: FileNode) => Promise<void>;
  projectName: string;
};

const getColorByStatus = (status?: string) => {
  switch (status) {
    case 'modified':
      return '#589838';
    case 'untracked':
      return '#9f3838';
    case 'staged':
      return 'green';
    case 'deleted':
      return 'red';
    case 'renamed':
      return 'blue';
    case 'conflicted':
      return 'purple';
    default:
      return 'inherit';
  }
};

const RenderTree: React.FC<Props> = ({
  node,
  fileStatuses,
  onFileSelect,
  onDelete,
  onNewFolder,
  onNewFile,
  onDbtRun,
  onDbtTest,
  projectName,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [isRunning, setIsRunning] = React.useState(false);

  const fileStatus = fileStatuses[node.path];
  const labelColor = getColorByStatus(fileStatus);

  const label = React.useMemo(() => {
    if (node.type === 'folder') {
      return <TreeItems.Folder label={node.name} />;
    }
    return (
      <TreeItems.File label={node.name} color={getColorByStatus(fileStatus)} />
    );
  }, [node, labelColor]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <TreeItem
      itemId={node.path}
      label={
        <LabelContainer>
          {label}
          <ActionsContainer className="actions-container">
            {node.path.includes(`/${projectName}/models/`) &&
              node.path.endsWith('sql') && (
                <IconButton
                  disabled={isRunning}
                  onClick={async (event) => {
                    event.stopPropagation();
                    setIsRunning(true);
                    await onDbtRun(node);
                    setIsRunning(false);
                  }}
                >
                  {isRunning ? (
                    <CircularProgress size={16} color="primary" />
                  ) : (
                    <Tooltip
                      title={`dbt run --select ${node.path.split('/').slice(-2).join('/')}`}
                    >
                      <PlayArrow
                        sx={{ height: 16, width: 16 }}
                        color="primary"
                      />
                    </Tooltip>
                  )}
                </IconButton>
              )}
            {node.path.includes(`/${projectName}/models/`) &&
              !node.path.endsWith('models/model.yaml') &&
              node.path.endsWith('yaml') && (
                <IconButton
                  disabled={isRunning}
                  onClick={async (event) => {
                    event.stopPropagation();
                    setIsRunning(true);
                    await onDbtTest(node);
                    setIsRunning(false);
                  }}
                >
                  {isRunning ? (
                    <CircularProgress size={16} color="primary" />
                  ) : (
                    <Tooltip
                      title={`dbt test --select ${node.path.split('/').slice(-2).join('/')}`}
                    >
                      <Speed sx={{ height: 16, width: 16 }} color="primary" />
                    </Tooltip>
                  )}
                </IconButton>
              )}
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              style={{ marginLeft: -16 }}
            >
              <MoreVert fontSize="small" />
            </IconButton>
          </ActionsContainer>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem
              onClick={(event) => {
                event.stopPropagation();
                onDelete(node.path);
                handleMenuClose();
              }}
            >
              Delete
            </MenuItem>
            <MenuItem
              onClick={(event) => {
                event.stopPropagation();
                navigator.clipboard.writeText(node.path);
                handleMenuClose();
              }}
            >
              Copy Path
            </MenuItem>
            {node.type === 'folder' && (
              <>
                <MenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onNewFolder(node.path);
                    handleMenuClose();
                  }}
                >
                  New Folder
                </MenuItem>
                <MenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onNewFile(node.path);
                    handleMenuClose();
                  }}
                >
                  New File
                </MenuItem>
                <MenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    projectsServices.zipDir(node.path);
                    handleMenuClose();
                  }}
                >
                  Zip Dir
                </MenuItem>
              </>
            )}
          </Menu>
        </LabelContainer>
      }
      onClick={() => {
        if (node.type === 'file') {
          onFileSelect(node);
        }
      }}
    >
      {node.children?.map((childNode) => (
        <RenderTree
          key={childNode.path}
          node={childNode}
          fileStatuses={fileStatuses}
          onFileSelect={onFileSelect}
          onDelete={onDelete}
          onNewFolder={onNewFolder}
          onNewFile={onNewFile}
          onDbtRun={onDbtRun}
          onDbtTest={onDbtTest}
          projectName={projectName}
        />
      ))}
    </TreeItem>
  );
};

export { RenderTree };
