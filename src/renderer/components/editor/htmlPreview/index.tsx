import React, { useMemo } from 'react';
import { Box } from '@mui/material';

interface HtmlPreviewProps {
  content: string;
  sourcePath: string;
}

export const HtmlPreview: React.FC<HtmlPreviewProps> = ({
  content,
  sourcePath,
}) => {
  const enhancedContent = useMemo(() => {
    // Extract directory from sourcePath (handles both / and \)
    const dir = sourcePath.substring(
      0,
      Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\')) + 1,
    );
    // Normalize to file:// URL format (forward slashes, leading slash for Windows)
    const normalizedDir = dir.replace(/\\/g, '/');
    const fileUrl = normalizedDir.startsWith('/')
      ? `file://${normalizedDir}`
      : `file:///${normalizedDir}`;
    // Inject <base> tag to help relative resources load from the right directory
    const baseTag = `<base href="${fileUrl}">`;

    if (content.toLowerCase().includes('<head>')) {
      return content.replace(/<head>/i, `<head>${baseTag}`);
    }
    return `${baseTag}${content}`;
  }, [content, sourcePath]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        backgroundColor: '#fff', // HTML pages generally expect a white background
        overflow: 'hidden',
      }}
    >
      <iframe
        title="HTML Preview"
        srcDoc={enhancedContent}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
      />
    </Box>
  );
};
