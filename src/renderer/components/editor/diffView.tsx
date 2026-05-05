import React from 'react';
import { MonacoDiffEditor } from '../monaco/MonacoDiffEditor';

type Props = {
  modified: string;
  original: string;
  language: string;
  theme: 'vs-dark' | 'light' | string;
};

/**
 * Side-by-side diff between the file's HEAD version and its working
 * content. Read-only by design.
 */
export const DiffView: React.FC<Props> = ({
  modified,
  original,
  language,
  theme,
}) => {
  const monacoTheme: 'vs-dark' | 'light' =
    theme === 'vs-dark' ? 'vs-dark' : 'light';

  return (
    <MonacoDiffEditor
      original={original}
      modified={modified}
      language={language}
      theme={monacoTheme}
    />
  );
};
