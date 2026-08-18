import React from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Clear,
  Search as SearchIcon,
  ExpandMore,
  ChevronRight,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { projectsServices } from '../../services';
import { FileSearchResult } from '../../../types/backend';

export type SearchResultSelection = {
  path: string;
  line: number;
  column: number;
  length: number;
};

type Props = {
  projectPath: string;
  onResultSelect: (selection: SearchResultSelection) => void;
};

const DEBOUNCE_MS = 300;

const toRelativePath = (filePath: string, projectPath: string): string => {
  if (!projectPath || !filePath.startsWith(projectPath)) return filePath;
  return filePath.slice(projectPath.length).replace(/^[/\\]/, '');
};

const HighlightedLine: React.FC<{
  text: string;
  column: number;
  length: number;
}> = ({ text, column, length }) => {
  const start = Math.max(0, Math.min(text.length, column - 1));
  const end = Math.max(start, Math.min(text.length, start + length));
  return (
    <>
      {text.slice(0, start)}
      <Box
        component="mark"
        sx={{
          bgcolor: 'warning.light',
          color: 'text.primary',
          borderRadius: 0.5,
        }}
      >
        {text.slice(start, end)}
      </Box>
      {text.slice(end)}
    </>
  );
};

export const SearchInFilesPanel: React.FC<Props> = ({
  projectPath,
  onResultSelect,
}) => {
  const theme = useTheme();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<FileSearchResult[]>([]);
  const [truncated, setTruncated] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const [collapsedPaths, setCollapsedPaths] = React.useState<Set<string>>(
    new Set(),
  );
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !projectPath) {
      setResults([]);
      setTruncated(false);
      setIsSearching(false);
      return undefined;
    }

    setIsSearching(true);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timeout = setTimeout(async () => {
      try {
        const response = await projectsServices.searchInFiles({
          path: projectPath,
          query: trimmed,
        });
        if (requestIdRef.current !== requestId) return;
        setResults(response.results);
        setTruncated(response.truncated);
      } catch {
        if (requestIdRef.current !== requestId) return;
        setResults([]);
        setTruncated(false);
      } finally {
        if (requestIdRef.current === requestId) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timeout);
  }, [query, projectPath]);

  const totalMatches = React.useMemo(
    () => results.reduce((sum, result) => sum + result.matches.length, 0),
    [results],
  );

  const toggleCollapsed = (path: string) => {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 0.5 }}
    >
      <Box sx={{ px: 0.5, mb: 1 }}>
        <TextField
          fullWidth
          autoFocus
          size="small"
          placeholder="Search in files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{
            '& .MuiInputBase-root': { height: 36, fontSize: 13 },
            '& .MuiInputBase-input': { py: 0, px: 1, fontSize: 13 },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment:
              // eslint-disable-next-line no-nested-ternary
              isSearching ? (
                <InputAdornment position="end">
                  <CircularProgress size={14} />
                </InputAdornment>
              ) : query ? (
                <InputAdornment position="end">
                  <Tooltip title="Clear search">
                    <IconButton
                      size="small"
                      aria-label="Clear search"
                      onClick={() => setQuery('')}
                      edge="end"
                    >
                      <Clear fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ) : null,
          }}
        />
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 0.5 }}>
        {!query.trim() && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 1, py: 2, textAlign: 'center' }}
          >
            Type to search across all files in this project.
          </Typography>
        )}
        {query.trim() && !isSearching && results.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 1, py: 2, textAlign: 'center' }}
          >
            No results found.
          </Typography>
        )}
        {results.length > 0 && (
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', px: 1, pb: 0.5 }}
            >
              {totalMatches} result{totalMatches === 1 ? '' : 's'} in{' '}
              {results.length} file{results.length === 1 ? '' : 's'}
              {truncated ? ' (showing first matches only)' : ''}
            </Typography>
            {results.map((fileResult) => {
              const isCollapsed = collapsedPaths.has(fileResult.path);
              return (
                <Box key={fileResult.path} sx={{ mb: 0.5 }}>
                  <Box
                    onClick={() => toggleCollapsed(fileResult.path)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: theme.palette.action.hover },
                    }}
                  >
                    {isCollapsed ? (
                      <ChevronRight
                        fontSize="small"
                        sx={{ color: 'text.secondary' }}
                      />
                    ) : (
                      <ExpandMore
                        fontSize="small"
                        sx={{ color: 'text.secondary' }}
                      />
                    )}
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                      title={fileResult.path}
                    >
                      {toRelativePath(fileResult.path, projectPath)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fileResult.matches.length}
                    </Typography>
                  </Box>
                  {!isCollapsed &&
                    fileResult.matches.map((match) => (
                      <Box
                        key={`${fileResult.path}:${match.line}:${match.column}`}
                        onClick={() =>
                          onResultSelect({
                            path: fileResult.path,
                            line: match.line,
                            column: match.column,
                            length: match.length,
                          })
                        }
                        sx={{
                          pl: 4,
                          pr: 1,
                          py: 0.25,
                          cursor: 'pointer',
                          borderRadius: 1,
                          '&:hover': { bgcolor: theme.palette.action.hover },
                        }}
                      >
                        <Typography
                          variant="caption"
                          component="div"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: 11.5,
                            color: 'text.secondary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Box component="span" sx={{ opacity: 0.6, mr: 1 }}>
                            {match.line}
                          </Box>
                          <HighlightedLine
                            text={match.lineText}
                            column={match.column}
                            length={match.length}
                          />
                        </Typography>
                      </Box>
                    ))}
                </Box>
              );
            })}
          </>
        )}
      </Box>
    </Box>
  );
};
