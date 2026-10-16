import React from 'react';
import { DuckDBWorkspaceCard } from './DuckDBWorkspaceCard';
import { SettingsStack } from './SettingsLayout';

export const DuckDBSettings: React.FC = () => {
  return (
    <SettingsStack>
      <DuckDBWorkspaceCard />
    </SettingsStack>
  );
};
