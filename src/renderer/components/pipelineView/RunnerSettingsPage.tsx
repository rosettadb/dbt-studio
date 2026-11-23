import React from 'react';
import { useGetSettings } from '../../controllers';
import { RunnerSettings } from '../settings/RunnerSettings';
import type { SettingsType } from '../../../types/backend';

// The Local Runner page of Settings. Reads the saved settings itself, so it
// can be registered as a settings page without props.
export const RunnerSettingsPage: React.FC = () => {
  const { data: settings } = useGetSettings();
  return <RunnerSettings settings={settings ?? ({} as SettingsType)} />;
};
