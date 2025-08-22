import React from 'react';
import { PlayCircleOutline, StopCircleOutlined } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SplitButton } from '../splitButton';
import { icons } from '../../../../assets';
import { Icon } from '../icon';
import { Command, CommandType, Project } from '../../../types/backend';
import { useDbt, useProcess } from '../../hooks';

interface ProjectDbtSplitButtonProps {
  rosettaPath?: string;
  dbtPath?: string;
  project: Project;
  isDbtConfigured: boolean;
  isRunningDbt: boolean;
  isRunningRosettaDbt: boolean;
  connection?: any;
  // Function handlers that are used elsewhere in ProjectDetails
  rosettaDbt: (project: Project, command: Command) => Promise<void>;
  handleBusinessLayerClick: () => void;
}

export const ProjectDbtSplitButton: React.FC<ProjectDbtSplitButtonProps> = ({
  rosettaPath,
  dbtPath,
  project,
  isDbtConfigured,
  isRunningDbt,
  isRunningRosettaDbt,
  connection,
  rosettaDbt,
  handleBusinessLayerClick,
}) => {
  // Functions that are only used in this component - moved inside
  const {
    run: dbtRun,
    test: dbtTest,
    compileProject: dbtCompileProject,
    build: dbtBuild,
    clean: dbtClean,
    debug: dbtDebug,
    docsGenerate: dbtDocsGenerate,
    seed: dbtSeed,
  } = useDbt();
  const { start, stop, isRunning } = useProcess();

  return (
    <SplitButton
      title="Project"
      tooltipTitle={
        isDbtConfigured ? '' : 'Please configure dbt path in settings'
      }
      disabled={isRunningDbt || isRunningRosettaDbt}
      isLoading={isRunningDbt || isRunningRosettaDbt}
      leftIcon={<PlayCircleOutline />}
      menuItems={[
        {
          name: 'Staging Layer',
          onClick: () => {
            if (!rosettaPath) {
              toast.info('Please configure RosettaDB path in settings');
              return;
            }
            rosettaDbt(project, {
              command: 'staging',
              commandType: CommandType.DBTNext,
              arguments: new Map<string, any>(),
            } as Command);
          },
          leftIcon: (
            <img
              src={icons.rosetta}
              alt="Rosetta"
              width={18}
              height={18}
              style={{
                display: 'inline-block',
                objectFit: 'contain',
              }}
            />
          ),
          subTitle: 'Generate dbt Staging Layer (runs extract first)',
        },
        {
          name: 'Incremental/Enhanced Layer',
          onClick: () => {
            if (!rosettaPath) {
              toast.info('Please configure RosettaDB path in settings');
              return;
            }
            rosettaDbt(project, {
              commandType: CommandType.DBTNext,
              command: 'incremental',
              arguments: new Map<string, any>(),
            } as Command);
          },
          leftIcon: (
            <img
              src={icons.rosetta}
              alt="Rosetta"
              width={18}
              height={18}
              style={{
                display: 'inline-block',
                objectFit: 'contain',
              }}
            />
          ),
          subTitle: 'Generate dbt Incremental Layer',
        },
        {
          name: 'Business Layer',
          onClick: () => {
            if (!rosettaPath) {
              toast.info('Please configure RosettaDB path in settings');
              return;
            }
            handleBusinessLayerClick();
          },
          leftIcon: (
            <img
              src={icons.rosetta}
              alt="Rosetta"
              width={18}
              height={18}
              style={{
                display: 'inline-block',
                objectFit: 'contain',
              }}
            />
          ),
          subTitle: 'Generate dbt Business Layer',
        },
        {
          name: 'Run',
          onClick: () => {
            if (!isDbtConfigured) {
              toast.info('Please configure dbt path in settings');
              return;
            }
            dbtRun(project);
          },
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Run the dbt project',
        },
        {
          name: 'Test',
          onClick: () => {
            if (!isDbtConfigured) {
              toast.info('Please configure dbt path in settings');
              return;
            }
            dbtTest(project);
          },
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Run the dbt test',
        },
        {
          name: 'Build',
          onClick: () => {
            if (!isDbtConfigured) {
              toast.info('Please configure dbt path in settings');
              return;
            }
            dbtBuild(project);
          },
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Build the dbt project',
        },
        {
          name: 'Compile',
          onClick: () => {
            if (!isDbtConfigured) {
              toast.info('Please configure dbt path in settings');
              return;
            }
            dbtCompileProject(project);
          },
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Compile the dbt project',
        },
        {
          name: 'Debug',
          onClick: () => {
            if (!isDbtConfigured) {
              toast.info('Please configure dbt path in settings');
              return;
            }
            dbtDebug(project);
          },
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Debug dbt connections and project',
        },
        {
          name: 'Generate Docs',
          onClick: () => {
            if (!isDbtConfigured) {
              toast.info('Please configure dbt path in settings');
              return;
            }
            dbtDocsGenerate(project);
          },
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Generate documentation for the project',
        },
        {
          name: (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>Serve Docs</span>
              {isRunning ? <StopCircleOutlined /> : <PlayCircleOutline />}
            </div>
          ),
          onClick: () => {
            if (isRunning) {
              stop();
              return;
            }
            start(
              `cd "${project.path}" && "${dbtPath}" docs serve`,
              connection?.connection?.name ?? '',
            );
          },
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Serve the documentation website',
        },
        {
          name: 'Clean',
          onClick: () => {
            if (!isDbtConfigured) {
              toast.info('Please configure dbt path in settings');
              return;
            }
            dbtClean(project);
          },
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Clean the dbt project',
        },
        {
          name: 'Seed',
          onClick: () => {
            if (!isDbtConfigured) {
              toast.info('Please configure dbt path in settings');
              return;
            }
            dbtSeed(project);
          },
          leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
          subTitle: 'Seed the dbt project',
        },
      ]}
    />
  );
};
