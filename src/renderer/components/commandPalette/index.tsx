import React from 'react';
import {
  Box,
  CircularProgress,
  Dialog,
  IconButton,
  InputBase,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  ArrowForward,
  InsertDriveFileOutlined,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  useGetProjectFiles,
  useGetProjects,
  useGetSelectedProject,
  useSelectProject,
} from '../../controllers';
import { useTabs } from '../../context/TabsProvider';
import { path as nodePath } from '../../lib/path';
import { projectsServices } from '../../services';
import { getBottomElements, getMainElements } from '../sidebar/elements';
import { LetterAvatar } from '../letterAvatar';
import { HighlightedLine, toRelativePath } from '../searchInFiles';
import { FileNode, FileSearchResult, Project } from '../../../types/backend';

type PaletteItem = {
  id: string;
  label: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  run: () => void;
};

type PaletteSection = {
  title: string;
  countLabel: string;
  items: PaletteItem[];
};

const MAX_FILES = 20;
const TEXT_SEARCH_MIN_LENGTH = 2;
const TEXT_SEARCH_DEBOUNCE_MS = 300;
// Keeps a row clear of the pinned section title when the arrow keys scroll to it.
const SECTION_HEADER_HEIGHT = '32px';

const flattenFiles = (node: FileNode | undefined): FileNode[] => {
  if (!node) return [];
  if (node.type === 'file') return [node];
  return (node.children ?? []).flatMap(flattenFiles);
};

const getFolderInsideProject = (
  filePath: string,
  projectPath: string,
): string => {
  const folder = nodePath.dirname(toRelativePath(filePath, projectPath));
  return folder === '.' ? 'Project root' : folder;
};

// The search icon in the top bar. Clicking it or pressing Ctrl+K opens one
// palette to jump to a screen, switch project, open a file by name or find
// text inside the project's files.
export const CommandPalette: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { openFile, openFileAt } = useTabs();
  const { data: projects = [] } = useGetProjects();
  const { data: selectedProject } = useGetSelectedProject();
  const { mutateAsync: selectProject } = useSelectProject();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [textResults, setTextResults] = React.useState<FileSearchResult[]>([]);
  const [isTextSearchTruncated, setIsTextSearchTruncated] =
    React.useState(false);
  const [isSearchingText, setIsSearchingText] = React.useState(false);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const projectPath = selectedProject?.path ?? '';
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const { data: projectTree } = useGetProjectFiles(selectedProject as Project, {
    enabled: open && !!selectedProject?.id,
  });

  // Ctrl+K anywhere opens the palette. Editors that already use the key
  // (Monaco starts its Ctrl+K chords with it) mark the event as handled.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (!open || !projectPath || trimmedQuery.length < TEXT_SEARCH_MIN_LENGTH) {
      setTextResults([]);
      setIsTextSearchTruncated(false);
      setIsSearchingText(false);
      return undefined;
    }
    let isCurrent = true;
    setIsSearchingText(true);
    const timeout = setTimeout(async () => {
      try {
        const response = await projectsServices.searchInFiles({
          path: projectPath,
          query: trimmedQuery,
        });
        if (isCurrent) {
          setTextResults(response.results);
          setIsTextSearchTruncated(response.truncated);
        }
      } catch {
        if (isCurrent) {
          setTextResults([]);
          setIsTextSearchTruncated(false);
        }
      } finally {
        if (isCurrent) setIsSearchingText(false);
      }
    }, TEXT_SEARCH_DEBOUNCE_MS);
    return () => {
      isCurrent = false;
      clearTimeout(timeout);
    };
  }, [open, projectPath, trimmedQuery]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  const sections: PaletteSection[] = React.useMemo(() => {
    const screenItems: PaletteItem[] = [
      ...getMainElements(!!selectedProject?.id),
      ...getBottomElements(),
    ]
      .filter((element) => !element.disabled)
      .filter((element) => element.text.toLowerCase().includes(lowerQuery))
      .map((element) => ({
        id: `goto-${element.path}`,
        label: element.text,
        description: element.description,
        icon: <ArrowForward sx={{ fontSize: 16 }} />,
        run: () => navigate(element.path),
      }));

    const projectItems: PaletteItem[] = projects
      .filter((project) => project.name.toLowerCase().includes(lowerQuery))
      .map((project) => ({
        id: `project-${project.id}`,
        label: project.name,
        description: project.path,
        icon: <LetterAvatar name={project.name ?? ''} size={16} />,
        run: async () => {
          await selectProject({ projectId: project.id });
          navigate('/app/dbt-project');
        },
      }));

    const matchingFiles = !lowerQuery
      ? []
      : flattenFiles(projectTree).filter((file) =>
          file.name.toLowerCase().includes(lowerQuery),
        );
    const fileItems: PaletteItem[] = matchingFiles
      .slice(0, MAX_FILES)
      .map((file) => ({
        id: `file-${file.path}`,
        label: file.name,
        description: getFolderInsideProject(file.path, projectPath),
        icon: <InsertDriveFileOutlined sx={{ fontSize: 16 }} />,
        run: () => {
          navigate('/app/dbt-project');
          openFile(file.path);
        },
      }));

    const textItems: PaletteItem[] = textResults
      .flatMap((result) =>
        result.matches.map((match) => ({ path: result.path, match })),
      )
      .map(({ path, match }) => ({
        id: `text-${path}:${match.line}:${match.column}`,
        label: (
          <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
            <HighlightedLine
              text={match.lineText}
              column={match.column}
              length={match.length}
            />
          </Box>
        ),
        description: `${toRelativePath(path, projectPath)} · line ${match.line}`,
        icon: <SearchIcon sx={{ fontSize: 16 }} />,
        run: () => {
          navigate('/app/dbt-project');
          openFileAt({
            path,
            line: match.line,
            column: match.column,
            length: match.length,
          });
        },
      }));

    const allSections: PaletteSection[] = [
      {
        title: 'Go to',
        countLabel: String(screenItems.length),
        items: screenItems,
      },
      {
        title: 'Projects',
        countLabel: String(projectItems.length),
        items: projectItems,
      },
      {
        title: 'Files',
        countLabel:
          matchingFiles.length > fileItems.length
            ? `${fileItems.length} of ${matchingFiles.length}`
            : String(fileItems.length),
        items: fileItems,
      },
      {
        title: 'Text in files',
        countLabel: `${textItems.length}${isTextSearchTruncated ? '+' : ''}`,
        items: textItems,
      },
    ];
    return allSections.filter((section) => section.items.length > 0);
  }, [
    lowerQuery,
    selectedProject?.id,
    projects,
    projectTree,
    projectPath,
    textResults,
    isTextSearchTruncated,
    navigate,
    selectProject,
    openFile,
    openFileAt,
  ]);

  const items = React.useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runItem(items[activeIndex]);
    }
  };

  return (
    <>
      <Tooltip title="Search (Ctrl+K)">
        <IconButton size="small" onClick={() => setOpen(true)}>
          <SearchIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={close}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { alignSelf: 'flex-start', mt: 10 } }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          <InputBase
            autoFocus
            fullWidth
            placeholder={
              selectedProject
                ? `Search screens, projects, and files in ${selectedProject.name}`
                : 'Search screens and projects'
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            sx={{ fontSize: 14 }}
          />
          {isSearchingText && <CircularProgress size={14} />}
        </Box>
        <Box sx={{ maxHeight: 420, overflowY: 'auto', pb: 1 }}>
          {items.length === 0 && !isSearchingText && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ px: 2, py: 3, textAlign: 'center' }}
            >
              No results found.
            </Typography>
          )}
          {sections.map((section) => (
            <Box key={section.title}>
              <Box
                sx={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: SECTION_HEADER_HEIGHT,
                  px: 2,
                  bgcolor: 'background.paper',
                  backgroundImage: `linear-gradient(${theme.palette.action.selected}, ${theme.palette.action.selected})`,
                  borderTop: `1px solid ${theme.palette.divider}`,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {section.title}
                </Typography>
                <Typography
                  component="span"
                  sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
                >
                  {section.countLabel}
                </Typography>
              </Box>
              {section.items.map((item) => {
                const index = items.indexOf(item);
                return (
                  <Box
                    key={item.id}
                    ref={(element: HTMLDivElement | null) => {
                      itemRefs.current[index] = element;
                    }}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => runItem(item)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 2,
                      py: 0.625,
                      cursor: 'pointer',
                      scrollMarginTop: SECTION_HEADER_HEIGHT,
                      bgcolor:
                        index === activeIndex
                          ? theme.palette.action.selected
                          : 'transparent',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        color: 'text.secondary',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 13 }} noWrap>
                        {item.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="div"
                        noWrap
                        title={item.description}
                      >
                        {item.description}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      </Dialog>
    </>
  );
};
