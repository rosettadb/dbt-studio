import React from 'react';
import { OnChange, loader } from '@monaco-editor/react';
import { useTheme, IconButton, Tooltip } from '@mui/material';
import { VerticalSplit } from '@mui/icons-material';
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
        />
      )}
    </Container>
  );
};
