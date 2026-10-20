import React from 'react';
import { getClassWithColor } from 'file-icons-js';
import { FileTypeBadge } from '../../utils/fileTypeIcon';

interface FileIconProps {
  fileName: string;
}

export const FileIcon: React.FC<FileIconProps> = ({ fileName }) => {
  // file-icons-js shows a database icon for YAML, so use the YML badge instead
  const lowerCaseName = fileName.toLowerCase();
  if (lowerCaseName.endsWith('.yml') || lowerCaseName.endsWith('.yaml')) {
    return (
      <span style={{ display: 'inline-flex', marginLeft: 2 }}>
        <FileTypeBadge filename={fileName} />
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
