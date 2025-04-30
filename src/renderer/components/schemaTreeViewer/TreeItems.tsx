// TreeItems.tsx
import React from 'react';
import {
  TableChart,
  Schema as SchemaIcon,
  Key as KeyIcon,
  Link as LinkIcon,
  LooksOne as LooksOneIcon,
  Code as CodeIcon,
  CalendarToday as CalendarIcon,
  Tag as TagIcon,
  Numbers as NumbersIcon,
  CheckBox as BooleanIcon,
  QuestionMark as UnknownTypeIcon,
} from '@mui/icons-material';
import { StyledTreeItem, StyledLabel, DatabaseIcon } from './styles';
import { ItemProps } from '../../../types/frontend';
import { OverflowTip } from '../overflowTip';

const getColumnIcon = (
  typeName?: string,
  primaryKey?: boolean,
  foreignKey?: boolean,
) => {
  if (primaryKey)
    return <KeyIcon sx={{ color: '#f4b350', width: 18, height: 18 }} />;
  if (foreignKey)
    return <LinkIcon sx={{ color: '#f4b350', width: 18, height: 18 }} />;

  if (!typeName)
    return <UnknownTypeIcon sx={{ color: '#5f89f4', width: 18, height: 18 }} />;

  const lowerType = typeName.toLowerCase();

  if (
    lowerType.includes('int') ||
    lowerType.includes('serial') ||
    lowerType.includes('number')
  ) {
    return <LooksOneIcon sx={{ color: '#5f89f4', width: 18, height: 18 }} />;
  }
  if (
    lowerType.includes('char') ||
    lowerType.includes('text') ||
    lowerType.includes('string')
  ) {
    return <TagIcon sx={{ color: '#5f89f4', width: 18, height: 18 }} />;
  }
  if (lowerType.includes('bool')) {
    return <BooleanIcon sx={{ color: '#5f89f4', width: 18, height: 18 }} />;
  }
  if (lowerType.includes('date') || lowerType.includes('time')) {
    return <CalendarIcon sx={{ color: '#5f89f4', width: 18, height: 18 }} />;
  }
  if (lowerType.includes('json') || lowerType.includes('xml')) {
    return <CodeIcon sx={{ color: '#5f89f4', width: 18, height: 18 }} />;
  }
  if (
    lowerType.includes('decimal') ||
    lowerType.includes('numeric') ||
    lowerType.includes('float')
  ) {
    return <NumbersIcon sx={{ color: '#5f89f4', width: 18, height: 18 }} />;
  }

  return <UnknownTypeIcon sx={{ color: '#5f89f4', width: 18, height: 18 }} />;
};

export const TreeItems = {
  Column: ({ label, typeName, primaryKey, foreignKey }: ItemProps) => (
    <StyledTreeItem>
      {getColumnIcon(typeName, primaryKey, foreignKey)}
      <StyledLabel variant="caption">
        <OverflowTip>{label}</OverflowTip>
      </StyledLabel>
    </StyledTreeItem>
  ),
  Schema: ({ label }: ItemProps) => (
    <StyledTreeItem>
      <SchemaIcon sx={{ color: '#5f89f4', width: 18, height: 18 }} />
      <StyledLabel variant="caption">
        <OverflowTip>{label}</OverflowTip>
      </StyledLabel>
    </StyledTreeItem>
  ),
  Table: ({ label }: ItemProps) => (
    <StyledTreeItem>
      <TableChart sx={{ color: '#5f89f4', width: 18, height: 18 }} />
      <StyledLabel variant="caption">
        <OverflowTip>{label}</OverflowTip>
      </StyledLabel>
    </StyledTreeItem>
  ),
  View: ({ label }: ItemProps) => (
    <StyledTreeItem>
      <TableChart sx={{ color: '#b3c5f3', width: 18, height: 18 }} />
      <StyledLabel variant="caption">
        <OverflowTip>{label}</OverflowTip>
      </StyledLabel>
    </StyledTreeItem>
  ),
  Database: ({ label, icon }: ItemProps) => (
    <StyledTreeItem>
      {icon && <DatabaseIcon src={icon} alt="icon" />}
      <StyledLabel variant="caption">
        <OverflowTip>{label}</OverflowTip>
      </StyledLabel>
    </StyledTreeItem>
  ),
};
