import React from 'react';

interface HtmlPreviewProps {
  filePath: string;
}

export const HtmlPreview: React.FC<HtmlPreviewProps> = ({ filePath }) => {
  return React.createElement('webview', {
    src: `html-preview://local${filePath}`,
    style: { width: '100%', height: '100%' },
  });
};
