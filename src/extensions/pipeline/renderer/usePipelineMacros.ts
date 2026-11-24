import React from 'react';
import { useQuery } from 'react-query';
import { getPluginMacroDirs } from './pipelineServices';
import type { MacroContext } from '../shared/pipelineShared';

/**
 * Values for the macros a plugin's widget defaults may hold
 * (${project.rosetta_dir}, ...). They are put into a step when it is added
 * in the designer; the pipeline file never holds a macro.
 */
export function usePipelineMacros(
  project: { name: string; path: string },
  connection?: { name?: string; type?: string },
): MacroContext {
  const { data: dirs } = useQuery({
    queryKey: ['PIPELINE_MACRO_DIRS', project.path],
    queryFn: () => getPluginMacroDirs(project.path),
  });
  return React.useMemo(
    () => ({
      'project.name': project.name,
      'project.dbt_dir': dirs?.dbtDir,
      'project.rosetta_dir': dirs?.rosettaDir,
      'connection.name': connection?.name,
      'connection.type': connection?.type,
    }),
    [project.name, dirs, connection?.name, connection?.type],
  );
}
