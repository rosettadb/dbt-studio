import React from 'react';
import { OnChange, loader } from '@monaco-editor/react';
import { useTheme, IconButton, Tooltip } from '@mui/material';
import { VerticalSplit } from '@mui/icons-material';
import { getVersionsFromDiff } from '../../helpers/utils';
import { gitServices, projectsServices } from '../../services';
import { CompletionItem } from '../../../types/frontend';
import {
  useGetFileStatuses,
  useGetProjectFiles,
  useGetSelectedProject,
} from '../../controllers';
import { Container } from './styles';
import { DiffView } from './diffView';
import { CodeEditor } from './codeEditor';
import { Project } from '../../../types/backend';

const getLanguageFromExtension = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'yaml':
    case 'yml':
    case 'conf':
      return 'yaml';
    case 'sql':
      return 'sql';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    default:
      return 'plaintext';
  }
};

export const Editor = ({
  filePath,
  content,
  setContent,
  completions = [],
  enableDiff = true,
}: {
  filePath?: string;
  content: string;
  setContent: (value: string) => void;
  completions?: Omit<CompletionItem, 'range'>[];
  enableDiff?: boolean;
}) => {
  loader.config({
    paths: {
      vs: 'app-asset://zui/node_modules/monaco-editor/min/vs',
    },
  });
  const { data: project } = useGetSelectedProject();
  const { refetch: updateStatuses } = useGetFileStatuses(project?.path ?? '');
  const { refetch: updateDirectories } = useGetProjectFiles(project as Project);
  const theme = useTheme();
  const monacoTheme = theme.palette.mode === 'dark' ? 'vs-dark' : 'light';
  const language = getLanguageFromExtension(filePath ?? 'txt');

  const [originalContent, setOriginalContent] = React.useState<string | null>(
    null,
  );
  const [showDiffView, setShowDiffView] = React.useState(false);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  React.useEffect(() => {
    if (!project?.path || !filePath || !enableDiff) return;
    gitServices
      .getFileDiff(project.path, filePath)
      // eslint-disable-next-line promise/always-return
      .then(({ diff }) => {
        const { oldVersion } = getVersionsFromDiff(content, String(diff));
        setOriginalContent(oldVersion);
      })
      .catch(() => {});
  }, [filePath, project?.path, enableDiff]);

  React.useEffect(() => {
    setShowDiffView(false);
  }, [filePath]);

  const handleChange: OnChange = (value) => {
    if (value !== undefined) {
      setContent(value);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        if (filePath) {
          projectsServices
            .saveFileContent({ path: filePath, content: value })
            // eslint-disable-next-line promise/always-return
            .then(async () => {
              await updateDirectories();
              await updateStatuses();
            })
            .catch(() => {});
        }
      }, 500);
    }
  };

  return (
    <Container>
      {enableDiff && originalContent && (
        <Tooltip title="Compare Changes">
          <IconButton
            onClick={() => setShowDiffView((prev) => !prev)}
            sx={{ position: 'absolute', right: 30, top: 0, zIndex: 999 }}
          >
            <VerticalSplit sx={{ color: 'primary.main' }} />
          </IconButton>
        </Tooltip>
      )}
      {enableDiff && showDiffView && originalContent ? (
        <DiffView
          modified={content}
          original={originalContent}
          language={language}
          theme={monacoTheme}
        />
      ) : (
        <CodeEditor
          content={content}
          originalContent={originalContent}
          language={language}
          theme={monacoTheme}
          onChange={handleChange}
          completions={completions}
        />
      )}
    </Container>
  );
};
