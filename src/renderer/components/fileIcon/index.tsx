import React from 'react';
import { Box } from '@mui/material';
import { getClassWithColor } from 'file-icons-js';
import { getFileTypeBadge } from '../../utils/fileTypeIcon';

interface FileIconProps {
  fileName: string;
}

// YAML file icon sized like the other 16px file icons, so it never
// spills into the file name next to it
export const YamlFileIcon: React.FC = () => {
  const { color } = getFileTypeBadge('file.yml');
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        width: 16,
        height: 16,
        flexShrink: 0,
        color,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        aria-label="YML"
      >
        <path d="M0 0h24v24H0z" fill="none" />
        <path
          fill="none"
          stroke="currentColor"
          strokeLinecap="square"
          strokeWidth="2"
          d="M5 13v1.002c0 .045-.013.09-.036.126l-1.464 2.3M2 13v1.002c0 .045.013.09.036.126l1.464 2.3m0 0V19m4-3v-2.571c0-.237.168-.429.375-.429h2.25c.207 0 .375.192.375.429V16m-3 0v3m0-3h3m0 0v3m7.572 0v-5.571c0-.237-.16-.429-.358-.429h-2.142m0 0v6m0-6h-2.5v6m7.428-6v5.571c0 .237.192.429.429.429h.571M20 10V7l-5-5H4v8m0 12h16M14 2v6h6"
        />
      </svg>
    </Box>
  );
};

export const FileIcon: React.FC<FileIconProps> = ({ fileName }) => {
  // file-icons-js shows a database icon for YAML, so use the YML badge instead
  const lowerCaseName = fileName.toLowerCase();
  if (lowerCaseName.endsWith('.yml') || lowerCaseName.endsWith('.yaml')) {
    return (
      <span style={{ display: 'inline-flex', marginLeft: 2 }}>
        <YamlFileIcon />
      </span>
    );
  }

  const iconClass = getClassWithColor(fileName);

  return (
    <span
      className={`icon ${iconClass}`}
      style={{ fontSize: '14px', marginLeft: 2 }}
    />
  );
};
