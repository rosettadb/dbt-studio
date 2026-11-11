import React from 'react';
import {
  CodeSharp,
  Cable,
  SnippetFolder,
  Cloud,
  ElectricalServices as ElectricalServicesIcon,
  LibraryBooks,
  Settings,
  Home as HomeMuiIcon,
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

// Main menu version: svg and its box are the same size so it centers like the other menu icons.
// 20px because the dbt logo fills its whole viewBox, unlike the padded MUI icons.
export const DBTStudioMenuIcon: React.FC = () => {
  const theme = useTheme();

  return (
    <Icon
      src={icons.dbtBlack}
      width={20}
      height={20}
      style={{ ...style, width: 20, height: 20 }}
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

// Main menu version: no right margin so it centers like the other menu icons
export const DataLakeMenuIcon: React.FC = () => {
  const theme = useTheme();
  return (
    <Icon
      src={icons.dataLakeSVG}
      width={24}
      height={24}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
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

// Nav rail entry for the selected project, whatever its type (dbt, Analytics).
// Shape is the VS Code Explorer "files" codicon (microsoft/vscode-codicons, CC BY 4.0).
// 20px by default because it fills its whole viewBox, like DBTStudioMenuIcon.
export const ProjectMenuIcon: React.FC<{ size?: number }> = ({ size = 20 }) => {
  const theme = useTheme();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={theme.palette.primary.main}
      width={size}
      height={size}
      style={{ display: 'block' }}
    >
      <path d="M7.5 22.5H17.595C17.07 23.4 16.11 24 15 24H7.5C4.185 24 1.5 21.315 1.5 18V6C1.5 4.89 2.1 3.93 3 3.405V18C3 20.475 5.025 22.5 7.5 22.5ZM21 8.121V18C21 19.6545 19.6545 21 18 21H7.5C5.8455 21 4.5 19.6545 4.5 18V3C4.5 1.3455 5.8455 0 7.5 0H12.879C13.4715 0 14.0505 0.24 14.4705 0.6585L20.3415 6.5295C20.766 6.954 21 7.5195 21 8.121ZM13.5 6.75C13.5 7.164 13.8375 7.5 14.25 7.5H19.1895L13.5 1.8105V6.75ZM19.5 18V9H14.25C13.0095 9 12 7.9905 12 6.75V1.5H7.5C6.672 1.5 6 2.1735 6 3V18C6 18.8265 6.672 19.5 7.5 19.5H18C18.828 19.5 19.5 18.8265 19.5 18Z" />
    </svg>
  );
};

export const SettingsIcon: React.FC = () => {
  const theme = useTheme();
  return <Settings sx={{ color: theme.palette.primary.main }} />;
};

export const FlowsIcon: React.FC = () => {
  const theme = useTheme();
  return (
    <Icon
      src={icons.flow}
      width={24}
      height={24}
      style={{ ...style }}
      color={theme.palette.primary.main}
    />
  );
};

export const HomeIcon: React.FC = () => (
  <HomeMuiIcon color="primary" sx={{ fontSize: 28 }} />
);
