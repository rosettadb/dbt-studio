import React from 'react';
import { OnChange, loader } from '@monaco-editor/react';
import { useTheme, IconButton, Tooltip } from '@mui/material';
import { VerticalSplit } from '@mui/icons-material';
import { isEditableFile } from '../../helpers/utils';
import { gitServices, projectsServices } from '../../services';
import {
  useGetFileStatus,
  useGetProjectFiles,
  useGetSelectedProject,
} from '../../controllers';
import { Container } from './styles';
import { DiffView } from './diffView';
import { CodeEditor } from './codeEditor';
import { Project } from '../../../types/backend';
import { getLanguageFromExtension, getVersionsFromDiff } from './helpers';

export const Editor = ({
  filePath,
  content,
  setContent,
  projectPath,
}: {
  filePath: string;
  content: string;
  setContent: (value: string) => void;
  projectPath: string;
}) => {
  loader.config({
    paths: {
      vs: 'app-asset://zui/node_modules/monaco-editor/min/vs',
    },
  });
  const { data: project } = useGetSelectedProject();
  const { data: fileStatus, refetch: updateFileStatus } = useGetFileStatus(
    projectPath,
    filePath,
    {
      refetchInterval: 10000,
    },
  );
  const { refetch: updateDirectories } = useGetProjectFiles(project as Project);
  const theme = useTheme();
  const monacoTheme = theme.palette.mode === 'dark' ? 'vs-dark' : 'light';
  const language = getLanguageFromExtension(filePath ?? 'txt');

  const isFileEditable = isEditableFile(filePath);

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
    setShowDiffView(false);
    const fetchData = async () => {
      if (fileStatus?.status === 'untracked') {
        setOriginalContent(null);
        return;
      }
      const fileDiff = await gitServices.getFileDiff(projectPath, filePath);
      const { oldVersion } = getVersionsFromDiff(
        content,
        String(fileDiff?.diff),
      );
      setOriginalContent(oldVersion);
    };
    fetchData();
  }, [filePath, projectPath, fileStatus]);

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
              await updateFileStatus();
            })
            .catch(() => {});
        }
      }, 500);
    }
  };

  return (
    <Container>
      {originalContent && (
        <Tooltip title="Compare Changes">
          <IconButton
            onClick={() => setShowDiffView((prev) => !prev)}
            sx={{ position: 'absolute', right: 30, top: 0, zIndex: 999 }}
          >
            <VerticalSplit sx={{ color: 'primary.main' }} />
          </IconButton>
        </Tooltip>
      )}
      {showDiffView && originalContent ? (
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
          readOnly={!isFileEditable}
        />
      )}
    </Container>
  );
};
