import React from 'react';
import { useGetSettings } from '../../../extensionApi/studio/controllers';
import { RunnerSettings } from './RunnerSettings';
import type { SettingsType } from '../../../extensionApi/studio/types';

// The Local Runner page of Settings. Reads the saved settings itself, so it
// can be registered as a settings page without props.
export const RunnerSettingsPage: React.FC = () => {
  const { data: settings } = useGetSettings();
  return <RunnerSettings settings={settings ?? ({} as SettingsType)} />;
};
