import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  useTheme,
} from '@mui/material';
import { History, HistoryOutlined } from '@mui/icons-material';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/ext-error_marker';
import 'ace-builds/src-noconflict/snippets/sql';
import 'ace-builds/src-noconflict/theme-solarized_light';
import 'ace-builds/src-noconflict/theme-dracula';
import moment from 'moment';
import { Container } from './styles';
import { QueryHistoryType } from '../../../../types/frontend';
import { projectsServices } from '../../../services';

type Props = {
  onQuerySelect: (value: QueryHistoryType) => void;
  queryHistory: QueryHistoryType[];
  projectId: string;
};

type ToolbarProps = {
  queryHistory: QueryHistoryType[];
  selectedProject: any;
  onQuerySelect: (historyItem: QueryHistoryType) => void;
};

// New simplified component for the toolbar
export const QueryHistoryToolbar: React.FC<ToolbarProps> = ({
  queryHistory,
  selectedProject,
  onQuerySelect,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [selectedQueryHistory, setSelectedQueryHistory] = React.useState<QueryHistoryType>();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const sortedHistory: QueryHistoryType[] = React.useMemo(() => {
    return queryHistory
      .filter((qh) => qh.projectId === selectedProject?.id)
      .sort(
        (a, b) =>
          new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime(),
      );
  }, [queryHistory, selectedProject?.id]);

  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleHistorySelect = (historyItem: QueryHistoryType) => {
    // Update the project query in the database
    if (selectedProject) {
      projectsServices.updateProject({
        ...selectedProject,
        queryEditor: historyItem.query,
      });
    }

    // Call the parent's onQuerySelect
    onQuerySelect(historyItem);
    setSelectedQueryHistory(undefined);
  };

  // Show history item details in dialog
  if (selectedQueryHistory) {
    return (
      <Dialog
        open={!!selectedQueryHistory}
        onClose={() => setSelectedQueryHistory(undefined)}
        fullWidth
      >
        <DialogTitle>Query History</DialogTitle>
        <DialogContent>
          <Container>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>
                    {moment(selectedQueryHistory.executedAt).format(
                      'MM.DD.yyyy - HH:mm',
                    )}
                  </span>
                  <HistoryOutlined
                    style={{
                      fontSize: 20,
                      color: theme.palette.primary.main,
                    }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 6 }}>
                Project: <u>{selectedQueryHistory.projectName}</u>
              </div>
            </div>
            <AceEditor
              style={{
                cursor: 'pointer',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '4px',
              }}
              mode="sql"
              width="auto"
              fontSize={18}
              height="150px"
              value={selectedQueryHistory.query}
              theme={isDarkMode ? 'dracula' : 'solarized_light'}
              readOnly
              showPrintMargin={false}
              editorProps={{ $blockScrolling: true }}
              setOptions={{
                showLineNumbers: true,
                highlightActiveLine: false
              }}
            />
            <div
              style={{
                display: 'flex',
                width: '100%',
                marginTop: 8,
              }}
            >
              <Button
                onClick={() => handleHistorySelect(selectedQueryHistory)}
                variant="contained"
                color="primary"
                style={{
                  marginLeft: 'auto',
                }}
              >
                Select
              </Button>
            </div>
          </Container>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedQueryHistory(undefined)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Show only if there's history and hide if no history
  if (sortedHistory.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: -15,
        right: -10,
        margin: 20,
      }}
    >
      <Tooltip title="Query History">
        <IconButton onClick={handleClick}>
          <History />
        </IconButton>
      </Tooltip>
      <Menu
        id="demo-customized-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        style={{
          maxHeight: 500,
        }}
      >
        <MenuItem
          style={{
            marginTop: -8,
            paddingTop: 8,
          }}
          disabled
        >
          Query History
        </MenuItem>
        {sortedHistory.map((qh, index) => (
          <Tooltip key={index} title={qh.query} placement="left">
            <MenuItem
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                margin: '4px 0',
              }}
              onClick={() => {
                setSelectedQueryHistory(qh);
                handleClose();
              }}
            >
              <div
                style={{
                  padding: '4px 12px',
                  background: theme.palette.background.paper,
                  borderRadius: theme.shape.borderRadius,
                  fontSize: 16,
                  color: theme.palette.primary.main,
                }}
              >
                {qh.query.trim().slice(0, 16)}...
              </div>
              <div
                style={{
                  marginLeft: 'auto',
                  fontSize: 14,
                  color: theme.palette.text.secondary,
                }}
              >
                {moment(qh.executedAt).fromNow()}
              </div>
            </MenuItem>
          </Tooltip>
        ))}
      </Menu>
    </div>
  );
};

// Keep the original QueryHistory component for backward compatibility
const QueryHistory: React.FC<Props> = ({
  queryHistory,
  onQuerySelect,
  projectId,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [selectedQueryHistory, setSelectedQueryHistory] =
    React.useState<QueryHistoryType>();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const sortedHistory: QueryHistoryType[] = React.useMemo(() => {
    return queryHistory
      .filter((qh) => qh.projectId === projectId)
      .sort(
        (a, b) =>
          new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime(),
      );
  }, [queryHistory]);

  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  if (selectedQueryHistory) {
    return (
      <Dialog
        open={!!selectedQueryHistory}
        onClose={() => setSelectedQueryHistory(undefined)}
        fullWidth
      >
        <DialogTitle>Query History</DialogTitle>
        <DialogContent>
          <Container>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>
                    {moment(selectedQueryHistory.executedAt).format(
                      'MM.DD.yyyy - HH:mm',
                    )}
                  </span>
                  <HistoryOutlined
                    style={{
                      fontSize: 20,
                      color: '#132985',
                    }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 6 }}>
                Project: <u>{selectedQueryHistory.projectName}</u>
              </div>
            </div>
            <AceEditor
              style={{
                cursor: 'pointer',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '4px',
              }}
              mode="sql"
              width="auto"
              fontSize={18}
              height="150px"
              value={selectedQueryHistory.query}
              theme={isDarkMode ? 'dracula' : 'solarized_light'}
              readOnly
              showPrintMargin={false}
              editorProps={{ $blockScrolling: true }}
              setOptions={{
                showLineNumbers: true,
                highlightActiveLine: false
              }}
            />
            <div
              style={{
                display: 'flex',
                width: '100%',
                marginTop: 8,
              }}
            >
              <Button
                onClick={() => {
                  // Pass the selected query history to parent component
                  onQuerySelect(selectedQueryHistory);

                  // Force editor to explicitly update if the editor reference is available
                  // This will be handled at the SqlEditor component level

                  // Close dialog after selection
                  setSelectedQueryHistory(undefined);
                }}
                variant="contained"
                color="primary"
                style={{
                  marginLeft: 'auto',
                }}
              >
                Select
              </Button>
            </div>
          </Container>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedQueryHistory(undefined)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: -15,
        right: -10,
        margin: 20,
      }}
    >
      <Tooltip title="Query History">
        <IconButton onClick={handleClick}>
          <History />
        </IconButton>
      </Tooltip>
      <Menu
        id="demo-customized-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        style={{
          maxHeight: 500,
        }}
      >
        <MenuItem
          style={{
            marginTop: -8,
            paddingTop: 8,
          }}
          disabled
        >
          Query History
        </MenuItem>
        {sortedHistory.map((qh, index) => (
          <Tooltip key={index} title={qh.query} placement="left">
            <MenuItem
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                margin: '4px 0',
              }}
              onClick={() => {
                setSelectedQueryHistory(qh);
                handleClose();
              }}
            >
              <div
                style={{
                  padding: '4px 12px',
                  background: theme.palette.background.paper,
                  borderRadius: theme.shape.borderRadius,
                  fontSize: 16,
                  color: theme.palette.primary.main,
                }}
              >
                {qh.query.trim().slice(0, 16)}...
              </div>
              <div
                style={{
                  marginLeft: 'auto',
                  fontSize: 14,
                  color: theme.palette.text.secondary,
                }}
              >
                {moment(qh.executedAt).fromNow()}
              </div>
            </MenuItem>
          </Tooltip>
        ))}
      </Menu>
    </div>
  );
};

export { QueryHistory };
