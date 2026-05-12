import React from 'react';
import { ToggleButtonGroup, ToggleButton, Tooltip } from '@mui/material';
import { ViewList, ViewModule } from '@mui/icons-material';

interface ViewToggleProps {
  view: 'list' | 'card';
  onViewChange: (view: 'list' | 'card') => void;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({
  view,
  onViewChange,
}) => {
  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newView: 'list' | 'card' | null,
  ) => {
    if (newView !== null) {
      onViewChange(newView);
    }
  };

  return (
    <ToggleButtonGroup
      value={view}
      exclusive
      onChange={handleChange}
      aria-label="view toggle"
      size="small"
    >
      <ToggleButton value="list" aria-label="list view">
        <Tooltip title="List View">
          <ViewList />
        </Tooltip>
      </ToggleButton>
      <ToggleButton value="card" aria-label="card view">
        <Tooltip title="Card View">
          <ViewModule />
        </Tooltip>
      </ToggleButton>
    </ToggleButtonGroup>
  );
};
