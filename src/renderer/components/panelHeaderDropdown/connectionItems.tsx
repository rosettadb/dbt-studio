import React from 'react';
import { Tooltip } from '@mui/material';
import { Link as LinkIcon } from '@mui/icons-material';
import { connectionIcon } from '../../../connections/registry.renderer';
import connectionIcons, {
  defaultIcon,
} from '../../../../assets/connectionIcons';
import type { ConnectionModel, Project } from '../../../types/backend';
import type { DuckLakeInstance } from '../../../types/duckLake';
import type { PanelHeaderDropdownItem } from '.';

const iconStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  objectFit: 'contain',
  flexShrink: 0,
};

// Items for the SQL Editor and Notebooks pickers: database connections, then
// DuckLake instances (their value is `ducklake-<id>`).
export const buildConnectionDropdownItems = (
  connections: ConnectionModel[],
  duckLakeInstances: DuckLakeInstance[],
  projects: Project[] | undefined,
  selectedProjectId: string | undefined,
): PanelHeaderDropdownItem[] => [
  ...connections.map((conn) => {
    // When several projects share the connection, name the selected one
    const linkedProject =
      projects?.find(
        (p) => p.connectionId === conn.id && p.id === selectedProjectId,
      ) ?? projects?.find((p) => p.connectionId === conn.id);
    return {
      value: conn.id,
      label: conn.connection.name,
      icon: (
        <img
          src={connectionIcon(conn.connection.type) || defaultIcon}
          alt=""
          style={iconStyle}
        />
      ),
      trailing: linkedProject && (
        <Tooltip title={`Project: ${linkedProject.name}`}>
          <LinkIcon
            sx={{
              fontSize: 16,
              color:
                linkedProject.id === selectedProjectId
                  ? 'success.main'
                  : 'text.disabled',
              transform: 'rotate(-45deg)',
            }}
          />
        </Tooltip>
      ),
    };
  }),
  ...duckLakeInstances.map((instance) => ({
    value: `ducklake-${instance.id}`,
    label: instance.name,
    icon: (
      <img
        src={connectionIcons.images.ducklake || defaultIcon}
        alt=""
        style={iconStyle}
      />
    ),
  })),
];
