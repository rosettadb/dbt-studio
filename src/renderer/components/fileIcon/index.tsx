import React from 'react';
import { getClassWithColor } from 'file-icons-js';

interface FileIconProps {
  fileName: string;
}

export const FileIcon: React.FC<FileIconProps> = ({ fileName }) => {
  const iconClass = getClassWithColor(fileName);

  return (
    <span
      className={`icon ${iconClass}`}
      style={{ fontSize: '18px', marginLeft: 2 }}
    />
  );
};
