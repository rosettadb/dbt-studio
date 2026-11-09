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
  ChevronRight,
  ExpandMore,
  FolderOutlined,
  InsertDriveFileOutlined,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
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
  description?: string;
  icon: React.ReactNode;
  run: () => void | Promise<void>;
  // Set on a file's row in "Text in files". Running it folds or unfolds the
  // file's matches and leaves the palette open.
  fileGroup?: { path: string; isCollapsed: boolean; matchCount: number };
  // Set on a text match: the id of the row of the file it belongs to.
  fileGroupItemId?: string;
};

type PaletteSection = {
  title: string;
  countLabel: string;
  resultCount: number;
  items: PaletteItem[];
};

type ProjectEntry = {
  node: FileNode;
  // Lower case, with forward slashes, relative to the project. Matching the
  // absolute path would let a word from the project's location match everything.
  searchablePath: string;
};

const MAX_FILES = 20;
const MAX_FOLDERS = 20;
const TEXT_SEARCH_MIN_LENGTH = 2;
const TEXT_SEARCH_DEBOUNCE_MS = 300;
// Keeps a row clear of the pinned section title when the arrow keys scroll to it.
const SECTION_HEADER_HEIGHT = '32px';
const GIT_INTERNALS_FOLDER = '.git';

const flattenProjectEntries = (
  folder: FileNode | undefined,
  projectPath: string,
): ProjectEntry[] =>
  (folder?.children ?? [])
    .filter((child) => child.name !== GIT_INTERNALS_FOLDER)
    .flatMap((child) => {
      const entry = {
        node: child,
        searchablePath: toRelativePath(child.path, projectPath)
          .replace(/\\/g, '/')
          .toLowerCase(),
      };
      return child.type === 'file'
        ? [entry]
        : [entry, ...flattenProjectEntries(child, projectPath)];
    });

// Name matches come first, so a long list of files that only match through
// their folder can't push them past the section's limit.
const findMatchingEntries = (
  entries: ProjectEntry[],
  lowerQuery: string,
): ProjectEntry[] => {
  if (!lowerQuery) return [];
  const pathQuery = lowerQuery.replace(/\\/g, '/');
  const isNameMatch = (entry: ProjectEntry) =>
    entry.node.name.toLowerCase().includes(lowerQuery);
  return [
    ...entries.filter(isNameMatch),
    ...entries.filter(
      (entry) =>
        !isNameMatch(entry) && entry.searchablePath.includes(pathQuery),
    ),
  ];
};

const getCountLabel = (shownCount: number, totalCount: number): string =>
  totalCount > shownCount
    ? `${shownCount} of ${totalCount}`
    : String(shownCount);

// Runs when the search box appears: the remembered search is selected, so
// typing straight away replaces it.
const selectInputText = (input: HTMLInputElement | null) => {
  input?.select();
};

const getFolderInsideProject = (
  filePath: string,
  projectPath: string,
): string => {
  const folder = nodePath.dirname(toRelativePath(filePath, projectPath));
  return folder === '.' ? 'Project root' : folder;
};

// The search icon in the top bar. Clicking it or pressing Ctrl+K opens one
// palette to jump to a screen, switch project, open a file or show a folder by
// name or path, or find text inside the project's files. The last search stays
// until the project changes, so reopening goes on to the next match.
export const CommandPalette: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { openFile, openFileAt, revealFolderInTree } = useTabs();
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
  const [collapsedFilePaths, setCollapsedFilePaths] = React.useState<
    Set<string>
  >(new Set());
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  // Left and right only fold files once the list is being walked with up and
  // down. Until then they keep moving the text cursor in the search box.
  const isWalkingListRef = React.useRef(false);
  const listboxId = React.useId();
  const getOptionId = (index: number) => `${listboxId}-option-${index}`;

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

  // A different project starts with a clean slate
  React.useEffect(() => {
    setQuery('');
    setActiveIndex(0);
  }, [selectedProject?.id]);

  // Drop the previous query's matches so they can't be opened while waiting.
  // Reopening the same search keeps them, so its rows don't jump around.
  React.useEffect(() => {
    setTextResults([]);
    setIsTextSearchTruncated(false);
  }, [projectPath, trimmedQuery]);

  React.useEffect(() => {
    if (!open || !projectPath || trimmedQuery.length < TEXT_SEARCH_MIN_LENGTH) {
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
    isWalkingListRef.current = false;
  };

  const setIsFileCollapsed = React.useCallback(
    (filePath: string, isCollapsed: boolean) => {
      setCollapsedFilePaths((current) => {
        const next = new Set(current);
        if (isCollapsed) {
          next.add(filePath);
        } else {
          next.delete(filePath);
        }
        return next;
      });
    },
    [],
  );

  const projectEntries = React.useMemo(
    () => flattenProjectEntries(projectTree, projectPath),
    [projectTree, projectPath],
  );

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

    const matchingEntries = findMatchingEntries(projectEntries, lowerQuery);
    const matchingFiles = matchingEntries.filter(
      (entry) => entry.node.type === 'file',
    );
    const matchingFolders = matchingEntries.filter(
      (entry) => entry.node.type !== 'file',
    );

    const fileItems: PaletteItem[] = matchingFiles
      .slice(0, MAX_FILES)
      .map(({ node: file }) => ({
        id: `file-${file.path}`,
        label: file.name,
        description: getFolderInsideProject(file.path, projectPath),
        icon: <InsertDriveFileOutlined sx={{ fontSize: 16 }} />,
        run: () => {
          navigate('/app/dbt-project');
          openFile(file.path);
        },
      }));

    const folderItems: PaletteItem[] = matchingFolders
      .slice(0, MAX_FOLDERS)
      .map(({ node: folder }) => ({
        id: `folder-${folder.path}`,
        label: folder.name,
        description: getFolderInsideProject(folder.path, projectPath),
        icon: <FolderOutlined sx={{ fontSize: 16 }} />,
        run: () => {
          navigate('/app/dbt-project');
          revealFolderInTree(folder.path);
        },
      }));

    const textItems: PaletteItem[] = textResults.flatMap((result) => {
      const fileGroupItemId = `text-file-${result.path}`;
      const isCollapsed = collapsedFilePaths.has(result.path);
      const fileRow: PaletteItem = {
        id: fileGroupItemId,
        label: toRelativePath(result.path, projectPath),
        icon: isCollapsed ? (
          <ChevronRight sx={{ fontSize: 16 }} />
        ) : (
          <ExpandMore sx={{ fontSize: 16 }} />
        ),
        fileGroup: {
          path: result.path,
          isCollapsed,
          matchCount: result.matches.length,
        },
        run: () => setIsFileCollapsed(result.path, !isCollapsed),
      };
      if (isCollapsed) return [fileRow];

      const matchRows: PaletteItem[] = result.matches.map((match) => ({
        id: `text-${result.path}:${match.line}:${match.column}`,
        label: (
          <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
            <HighlightedLine
              text={match.lineText}
              column={match.column}
              length={match.length}
            />
          </Box>
        ),
        description: `Line ${match.line}`,
        icon: <SearchIcon sx={{ fontSize: 16 }} />,
        fileGroupItemId,
        run: () => {
          navigate('/app/dbt-project');
          openFileAt({
            path: result.path,
            line: match.line,
            column: match.column,
            length: match.length,
          });
        },
      }));
      return [fileRow, ...matchRows];
    });
    const textMatchCount = textResults.reduce(
      (count, result) => count + result.matches.length,
      0,
    );

    const allSections: PaletteSection[] = [
      {
        title: 'Go to',
        countLabel: String(screenItems.length),
        resultCount: screenItems.length,
        items: screenItems,
      },
      {
        title: 'Projects',
        countLabel: String(projectItems.length),
        resultCount: projectItems.length,
        items: projectItems,
      },
      {
        title: 'Files',
        countLabel: getCountLabel(fileItems.length, matchingFiles.length),
        resultCount: fileItems.length,
        items: fileItems,
      },
      {
        title: 'Folders',
        countLabel: getCountLabel(folderItems.length, matchingFolders.length),
        resultCount: folderItems.length,
        items: folderItems,
      },
      {
        title: 'Text in files',
        countLabel: `${textMatchCount}${isTextSearchTruncated ? '+' : ''}`,
        resultCount: textMatchCount,
        items: textItems,
      },
    ];
    return allSections.filter((section) => section.items.length > 0);
  }, [
    lowerQuery,
    selectedProject?.id,
    projects,
    projectEntries,
    projectPath,
    textResults,
    isTextSearchTruncated,
    collapsedFilePaths,
    setIsFileCollapsed,
    navigate,
    selectProject,
    openFile,
    openFileAt,
    revealFolderInTree,
  ]);

  const items = React.useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  const resultCount = sections.reduce(
    (count, section) => count + section.resultCount,
    0,
  );

  React.useEffect(() => {
    setActiveIndex(0);
    setCollapsedFilePaths(new Set());
    isWalkingListRef.current = false;
  }, [query]);

  // A reopened search can come back shorter if files changed in the meantime
  React.useEffect(() => {
    if (items.length > 0 && activeIndex >= items.length) {
      setActiveIndex(items.length - 1);
    }
  }, [items.length, activeIndex]);

  const scrollActiveItemIntoView = () => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  };

  React.useEffect(scrollActiveItemIntoView, [activeIndex]);

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    if (!item.fileGroup) close();
    Promise.resolve(item.run()).catch((error: Error) => {
      toast.error(error?.message || 'Could not open the selected item');
    });
  };

  const foldOrUnfoldActiveFile = (event: React.KeyboardEvent) => {
    if (!isWalkingListRef.current) return;
    const activeItem = items[activeIndex];
    if (!activeItem) return;

    if (activeItem.fileGroup) {
      const shouldCollapse = event.key === 'ArrowLeft';
      if (activeItem.fileGroup.isCollapsed === shouldCollapse) return;
      event.preventDefault();
      setIsFileCollapsed(activeItem.fileGroup.path, shouldCollapse);
    } else if (activeItem.fileGroupItemId && event.key === 'ArrowLeft') {
      const fileRowIndex = items.findIndex(
        (item) => item.id === activeItem.fileGroupItemId,
      );
      event.preventDefault();
      setIsFileCollapsed(items[fileRowIndex].fileGroup!.path, true);
      setActiveIndex(fileRowIndex);
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      isWalkingListRef.current = true;
      setActiveIndex((index) =>
        Math.max(0, Math.min(index + 1, items.length - 1)),
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      isWalkingListRef.current = true;
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      foldOrUnfoldActiveFile(event);
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
        TransitionProps={{ onEntered: scrollActiveItemIntoView }}
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
            inputRef={selectInputText}
            placeholder={
              selectedProject
                ? `Search screens, projects, files and folders in ${selectedProject.name}`
                : 'Search screens and projects'
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            inputProps={{
              role: 'combobox',
              'aria-label': 'Search',
              'aria-autocomplete': 'list',
              'aria-expanded': items.length > 0,
              'aria-controls': listboxId,
              'aria-activedescendant': items[activeIndex]
                ? getOptionId(activeIndex)
                : undefined,
            }}
            sx={{ fontSize: 14 }}
          />
          {isSearchingText && <CircularProgress size={14} />}
        </Box>
        {/* Read out by screen readers whenever the number of results changes */}
        <Box
          role="status"
          sx={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
          }}
        >
          {isSearchingText && items.length === 0
            ? ''
            : `${resultCount} result${resultCount === 1 ? '' : 's'}`}
        </Box>
        {items.length === 0 && !isSearchingText && (
          <Typography
            variant="body2"
            color="text.secondary"
            aria-hidden
            sx={{ px: 2, py: 3, textAlign: 'center' }}
          >
            No results found.
          </Typography>
        )}
        <Box
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          sx={{ maxHeight: 420, overflowY: 'auto', pb: 1 }}
        >
          {sections.map((section) => (
            <Box key={section.title} role="group" aria-label={section.title}>
              <Box
                aria-hidden
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
                const { fileGroup } = item;
                return (
                  <Box
                    key={item.id}
                    id={getOptionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    aria-label={
                      fileGroup
                        ? `${item.label}, ${fileGroup.matchCount} match${fileGroup.matchCount === 1 ? '' : 'es'}, ${fileGroup.isCollapsed ? 'collapsed' : 'expanded'}`
                        : undefined
                    }
                    ref={(element: HTMLDivElement | null) => {
                      itemRefs.current[index] = element;
                    }}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => runItem(item)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      pl: item.fileGroupItemId ? 5 : 2,
                      pr: 2,
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
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: fileGroup ? 600 : undefined,
                        }}
                        noWrap
                      >
                        {item.label}
                      </Typography>
                      {item.description && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="div"
                          noWrap
                          title={item.description}
                        >
                          {item.description}
                        </Typography>
                      )}
                    </Box>
                    {fileGroup && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ flexShrink: 0 }}
                      >
                        {fileGroup.matchCount}
                      </Typography>
                    )}
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
