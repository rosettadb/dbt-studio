import React from 'react';
import { OnChange, loader } from '@monaco-editor/react';
import {
  useTheme,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import { Undo, Redo, VerticalSplit, Edit } from '@mui/icons-material';
import { isEditableFile } from '../../helpers/utils';
import {
  useGetFileDiff,
  useGetFileStatus,
  useSaveFileContent,
} from '../../controllers';
import { Container } from './styles';
import { DiffView } from './diffView';
import { CodeEditor } from './codeEditor';
import { getLanguageFromExtension, getVersionsFromDiff } from './helpers';

export const Editor = ({
  filePath,
  content,
  projectPath,
}: {
  filePath: string;
  content: string;
  projectPath: string;
}) => {
  loader.config({
    paths: {
      vs: 'app-asset://zui/node_modules/monaco-editor/min/vs',
    },
  });
  const { data: fileStatus, isLoading: isLoadingFileStatus } = useGetFileStatus(
    projectPath,
    filePath,
    {
      refetchInterval: 10000,
    },
  );
  const { data: fileDiff } = useGetFileDiff(projectPath, filePath);
  const { mutate: updateFileContent } = useSaveFileContent();
  const theme = useTheme();
  const monacoTheme = theme.palette.mode === 'dark' ? 'vs-dark' : 'light';
  const language = getLanguageFromExtension(filePath ?? 'txt');

  const isFileEditable = isEditableFile(filePath);
  const [showDiffView, setShowDiffView] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const editorRef = React.useRef<any>(null);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const originalContent = React.useMemo(() => {
    if (fileStatus?.status === 'untracked' || !fileStatus?.status) {
      return null;
    }
    const { oldVersion } = getVersionsFromDiff(content, String(fileDiff?.diff));
    return oldVersion;
  }, [fileStatus, fileDiff]);

  React.useEffect(() => {
    setShowDiffView(false);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [filePath, projectPath, fileStatus, fileDiff]);

  const handleChange: OnChange = (value) => {
    if (value !== undefined) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        updateFileContent({ path: filePath, content: value });
      }, 1000);
    }
  };

  const handleUndo = () => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'undo', null);
    }
    setMenuAnchor(null);
  };

  const handleRedo = () => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'redo', null);
    }
    setMenuAnchor(null);
  };

  const handleToggleDiff = () => {
    setShowDiffView((prev) => !prev);
    setMenuAnchor(null);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  // Create menu items based on available features
  const menuItems = React.useMemo(() => {
    const items = [];

    if (originalContent) {
      items.push({
        icon: <VerticalSplit sx={{ fontSize: 16 }} />,
        name: showDiffView ? 'Hide Git Diff' : 'Show Git Diff',
        onClick: handleToggleDiff,
      });
    }

    if (isFileEditable) {
      items.push(
        {
          icon: <Undo sx={{ fontSize: 16 }} />,
          name: 'Undo',
          shortcut: 'Ctrl+Z',
          onClick: handleUndo,
        },
        {
          icon: <Redo sx={{ fontSize: 16 }} />,
          name: 'Redo',
          shortcut: 'Ctrl+Y',
          onClick: handleRedo,
        },
      );
    }

    return items;
  }, [isFileEditable, originalContent, showDiffView]);

  return (
    <Container>
      {filePath && (
        <>
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 1000,
              width: 28,
              height: 28,
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <Edit sx={{ fontSize: 14 }} />
          </IconButton>
          {menuItems.length > 0 && (
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={handleMenuClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              sx={{
                '& .MuiPaper-root': {
                  minWidth: 160,
                },
                '& .MuiMenuItem-root': {
                  fontSize: '0.75rem',
                  minHeight: 28,
                  paddingY: 0.25,
                  paddingX: 0.75,
                },
                '& .MuiListItemIcon-root': {
                  minWidth: 24,
                },
                '& .MuiListItemText-root': {
                  margin: 0,
                  '& .MuiTypography-root': {
                    fontSize: '0.75rem',
                  },
                },
              }}
            >
              {menuItems.map((item) => (
                <MenuItem key={item.name} onClick={item.onClick}>
                  <ListItemIcon sx={{ minWidth: 24 }}>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.name}
                    slotProps={{
                      primary: { fontSize: '0.75rem' },
                    }}
                  />
                  {item.shortcut && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 0.5, fontSize: '0.7rem' }}
                    >
                      {item.shortcut}
                    </Typography>
                  )}
                </MenuItem>
              ))}
            </Menu>
          )}
        </>
      )}
      {showDiffView && !isLoadingFileStatus && (
        <DiffView
          modified={content}
          original={originalContent ?? ''}
          language={language}
          theme={monacoTheme}
        />
      )}
      {!showDiffView && !isLoadingFileStatus && (
        <CodeEditor
          content={content}
          originalContent={originalContent}
          language={language}
          theme={monacoTheme}
          onChange={handleChange}
          readOnly={!isFileEditable}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
        />
      )}
    </Container>
  );
};
