import React from 'react';
import {
  CodeSharp,
  Cable,
  SnippetFolder,
  Cloud,
  ElectricalServices as ElectricalServicesIcon,
  LibraryBooks,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { icons } from '../../../../assets';
import { Icon } from '../icon';

const style = {
  display: 'inline-block',
  verticalAlign: 'middle',
  margin: '5 2 5 2px',
  width: '24px',
  height: '24px',
};

export const DataSources: React.FC = () => {
  const theme = useTheme();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke={theme.palette.primary.main}
      width={24}
      height={24}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
      />
    </svg>
  );
};

export const Connections: React.FC = () => <Cable color="primary" />;

export const SelectProject: React.FC = () => <SnippetFolder color="primary" />;

export const Model: React.FC = () => (
  <img
    src={icons.collection}
    alt="models"
    style={{ ...style, width: 24, height: 20 }}
  />
);

export const SQL: React.FC = () => <CodeSharp color="primary" />;

export const CloudIcon: React.FC = () => <Cloud color="primary" />;

export const DBTProjects: React.FC = () => {
  const theme = useTheme();

  return (
    <Icon
      src={icons.dbtBlack}
      style={{ ...style, width: 24, height: 24, marginLeft: 2 }}
      color={theme.palette.primary.main}
    />
  );
};

export const ElectricalServices: React.FC = () => (
  <ElectricalServicesIcon color="primary" />
);

export const DuckLakeSVG: React.FC = () => {
  const theme = useTheme();
  return (
    <Icon
      src={icons.duckLakeSVG}
      width={36}
      height={36}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        margin: '-6px 2px 0 -6px',
        overflow: 'hidden',
      }}
      color={theme.palette.primary.main}
    />
  );
};

export const DuckLake: React.FC = () => {
  return (
    <img
      src={icons.duckLake}
      alt="data-lake"
      style={{ ...style, width: 24, height: 24 }}
    />
  );
};

export const DataLakeSVG: React.FC<{ width?: number; height?: number }> = ({
  width = 24,
  height = 24,
}) => {
  const theme = useTheme();
  return (
    <Icon
      src={icons.dataLakeSVG}
      width={width || 24}
      height={height || 24}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        margin: '0 2px 0 0',
        overflow: 'hidden',
      }}
      color={theme.palette.primary.main}
    />
  );
};

export const DataLake: React.FC = () => {
  return (
    <img
      src={icons.dataLake}
      alt="data-lake"
      style={{ ...style, width: 24, height: 24 }}
    />
  );
};

export const NotebooksIcon: React.FC = () => <LibraryBooks color="primary" />;
