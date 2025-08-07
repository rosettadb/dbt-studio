import React from 'react';
import { Hardware } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SplitButton } from '../splitButton';
import { Icon } from '../icon';
import { icons } from '../../../../assets/icons';
import { extractModelNameFromPath } from '../../helpers/utils';
import { Project } from '../../../types/backend';
import { useDbt } from '../../hooks';

interface BuildDbtSplitButtonProps {
  modelPath: string;
  project: Project;
  isDbtConfigured: boolean;
  fileContent?: string;
  isRunningDbt: boolean;
  isRunningRosettaDbt: boolean;
}

export const BuildDbtSplitButton: React.FC<BuildDbtSplitButtonProps> = ({
  modelPath,
  project,
  isDbtConfigured,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fileContent,
  isRunningDbt,
  isRunningRosettaDbt,
}) => {
  const { build: dbtBuildModel } = useDbt();

  const handleBuildModel = async () => {
    if (!isDbtConfigured) {
      toast.info('Please configure dbt path in settings');
      return;
    }

    try {
      // Extract model name from path for single model building
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        toast.error('Could not extract model name from path');
        return;
      }

      // Build the single model using dbt build --select
      // This will run the model + tests + seeds + snapshots
      await dbtBuildModel(project, modelName);
      toast.success(`Model '${modelName}' built successfully with tests`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Model build failed: ${errorMessage}`);
    }
  };

  const handleBuildModelDownstream = async () => {
    if (!isDbtConfigured) {
      toast.info('Please configure dbt path in settings');
      return;
    }

    try {
      // Extract model name from path for downstream building
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        toast.error('Could not extract model name from path');
        return;
      }

      // Build the model and all its downstream dependencies using dbt build --select model_name+
      // The + suffix tells dbt to include all downstream models
      await dbtBuildModel(project, `${modelName}+`);
      toast.success(
        `Model '${modelName}' and downstream models built successfully`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Downstream build failed: ${errorMessage}`);
    }
  };

  const handleBuildModelUpstream = async () => {
    if (!isDbtConfigured) {
      toast.info('Please configure dbt path in settings');
      return;
    }

    try {
      // Extract model name from path for upstream building
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        toast.error('Could not extract model name from path');
        return;
      }

      // Build the model and all its upstream dependencies using dbt build --select +model_name
      // The + prefix tells dbt to include all upstream models (parents)
      await dbtBuildModel(project, `+${modelName}`);
      toast.success(
        `Model '${modelName}' and upstream models built successfully`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Upstream build failed: ${errorMessage}`);
    }
  };

  const handleBuildModelBothDirections = async () => {
    if (!isDbtConfigured) {
      toast.info('Please configure dbt path in settings');
      return;
    }

    try {
      // Extract model name from path for both directions building
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        toast.error('Could not extract model name from path');
        return;
      }

      // Build the model and all its upstream and downstream dependencies using dbt build --select +model_name+
      // The + prefix and suffix tells dbt to include both upstream and downstream models
      await dbtBuildModel(project, `+${modelName}+`);
      toast.success(
        `Model '${modelName}' and all related models (upstream + downstream) built successfully`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Full dependency build failed: ${errorMessage}`);
    }
  };

  return (
    <SplitButton
      title="Build"
      tooltipTitle={
        isDbtConfigured ? '' : 'Please configure dbt path in settings'
      }
      disabled={isRunningDbt || isRunningRosettaDbt}
      isLoading={isRunningDbt || isRunningRosettaDbt}
      leftIcon={<Hardware />}
      menuItems={[
        {
          name: 'Build Model',
          onClick: handleBuildModel,
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Build model with tests and validation',
        },
        {
          name: 'Build model+ (Downstream)',
          onClick: handleBuildModelDownstream,
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Build the model and all its downstream dependencies',
        },
        {
          name: 'Build +model (Upstream)',
          onClick: handleBuildModelUpstream,
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Build the model and all its upstream dependencies',
        },
        {
          name: 'Build +model+ (Up/downstream)',
          onClick: handleBuildModelBothDirections,
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle:
            'Build the model and all its upstream and downstream dependencies',
        },
      ]}
    />
  );
};
