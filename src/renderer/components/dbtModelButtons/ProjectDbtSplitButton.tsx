import React from 'react';
import {
  PlayCircleOutline,
  StopCircleOutlined,
  AccountTree,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SplitButton } from '../splitButton';
import { icons } from '../../../../assets';
import { Icon } from '../icon';
import {
  Command,
  CommandType,
  DbtCommandType,
  Project,
} from '../../../types/backend';
import { useDbt, useProcess, useRunner } from '../../hooks';
import { useGetSettings } from '../../controllers';
import {
  StagingModal,
  IncrementalModal,
  RawLayerModal,
  PushToCloudModal,
  PipelineSelectorModal,
} from '../modals';
import { pathJoin } from '../../services/settings.services';

interface ProjectDbtSplitButtonProps {
  rosettaPath?: string;
  dbtPath?: string;
  project: Project;
  isDbtConfigured: boolean;
  isRunningDbt: boolean;
  isRunningRosettaDbt: boolean;
  connection?: any;
  environment?: 'local' | 'cloud';
  onBeforeExecute?: () => void;
  // Function handlers that are used elsewhere in ProjectDetails
  rosettaDbt: (project: Project, command: Command) => Promise<void>;
}

export const ProjectDbtSplitButton: React.FC<ProjectDbtSplitButtonProps> = ({
  rosettaPath,
  dbtPath,
  project,
  isDbtConfigured,
  isRunningDbt,
  isRunningRosettaDbt,
  connection,
  environment = 'local',
  onBeforeExecute,
  rosettaDbt,
}) => {
  // Functions that are only used in this component - moved inside
  const [runInCloudModal, setRunInCloudModal] =
    React.useState<DbtCommandType>();

  const {
    run: dbtRun,
    test: dbtTest,
    compileProject: dbtCompileProject,
    build: dbtBuild,
    clean: dbtClean,
    debug: dbtDebug,
    docsGenerate: dbtDocsGenerate,
    deps: dbtDeps,
    seed: dbtSeed,
  } = useDbt(undefined, (command) => {
    setRunInCloudModal(command);
  });
  const { start, stop, isRunning } = useProcess();
  const { run: runPipelineLocally } = useRunner();
  const { data: settings } = useGetSettings();
  const isDbtV2 = !!settings?.dbtVersion?.startsWith('2.');
  const cloudV2Blocked = environment === 'cloud' && isDbtV2;
  const [stagingPath, setStagingPath] = React.useState('');
  const [rawPath, setRawPath] = React.useState('');
  const [incrementalPath, setIncrementalPath] = React.useState('');
  const [stagingModal, setStagingModal] = React.useState(false);
  const [openRawLayerModal, setOpenRawLayerModal] = React.useState(false);
  const [incrementalModal, setIncrementalModal] = React.useState(false);
  const [pipelineModal, setPipelineModal] = React.useState(false);
  const [pipelineArgs, setPipelineArgs] = React.useState('');
  const [localPipelineModal, setLocalPipelineModal] = React.useState(false);

  React.useEffect(() => {
    const loadDefaults = async () => {
      if (project.rawLayerDir) {
        setRawPath(project.rawLayerDir);
      } else {
        const p = await pathJoin(project.path, 'models', 'raw');
        setRawPath(p);
      }
      if (project.stagingDir) {
        setStagingPath(project.stagingDir);
      } else {
        const p = await pathJoin(project.path, 'models', 'staging');
        setStagingPath(p);
      }
      if (project.incrementalDir) {
        setIncrementalPath(project.incrementalDir);
      } else {
        const p = await pathJoin(project.path, 'models', 'enhanced');
        setIncrementalPath(p);
      }
    };
    loadDefaults();
  }, [project.path]);

  // Define all menu items with environment restrictions
  const allMenuItems: {
    name: string | React.ReactNode;
    onClick: () => void;
    leftIcon: React.ReactNode;
    subTitle: string;
    localOnly: boolean;
    cloudOnly?: boolean;
    dividerBefore?: boolean;
    hidden?: boolean;
  }[] = [
    // Rosetta Layer Generation Commands (Local Only)
    {
      name: 'Raw Layer',
      onClick: () => {
        if (!rosettaPath) {
          toast.info('Please configure RosettaDB path in settings');
          return;
        }
        setOpenRawLayerModal(true);
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
      subTitle: 'Generate dbt Raw Layer',
      localOnly: true,
    },
    {
      name: 'Staging Layer',
      onClick: () => {
        if (!rosettaPath) {
          toast.info('Please configure RosettaDB path in settings');
          return;
        }
        setStagingModal(true);
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
      localOnly: true,
    },
    {
      name: 'Incremental/Enhanced Layer',
      onClick: () => {
        if (!rosettaPath) {
          toast.info('Please configure RosettaDB path in settings');
          return;
        }
        setIncrementalModal(true);
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
      localOnly: true,
    },
    // Production DBT Commands (Available in both environments)
    {
      name: 'Run',
      onClick: () => {
        if (!isDbtConfigured) {
          toast.info('Please configure dbt path in settings');
          return;
        }
        onBeforeExecute?.();
        dbtRun(project);
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Run the dbt project',
      localOnly: false,
    },
    {
      name: 'Test',
      onClick: () => {
        if (!isDbtConfigured) {
          toast.info('Please configure dbt path in settings');
          return;
        }
        onBeforeExecute?.();
        dbtTest(project);
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Run the dbt test',
      localOnly: false,
    },
    {
      name: 'Build',
      onClick: () => {
        if (!isDbtConfigured) {
          toast.info('Please configure dbt path in settings');
          return;
        }
        onBeforeExecute?.();
        dbtBuild(project);
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Build the dbt project',
      localOnly: false,
    },
    {
      name: 'Compile',
      onClick: () => {
        if (!isDbtConfigured) {
          toast.info('Please configure dbt path in settings');
          return;
        }
        onBeforeExecute?.();
        dbtCompileProject(project);
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Compile the dbt project',
      localOnly: false,
    },
    {
      name: 'Debug',
      onClick: () => {
        if (!isDbtConfigured) {
          toast.info('Please configure dbt path in settings');
          return;
        }
        onBeforeExecute?.();
        dbtDebug(project);
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Debug dbt connections and project',
      localOnly: true, // Debug is for local development
    },
    {
      name: 'Generate Docs',
      onClick: () => {
        if (!isDbtConfigured) {
          toast.info('Please configure dbt path in settings');
          return;
        }
        onBeforeExecute?.();
        dbtDocsGenerate(project);
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Generate documentation for the project',
      localOnly: true, // Docs generation is typically local
      hidden: isDbtV2, // dbt Core v2 does not support docs generation
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
        onBeforeExecute?.();
        start(
          `cd "${project.path}" && "${dbtPath}" docs serve`,
          connection?.connection?.name ?? '',
        );
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Serve the documentation website',
      localOnly: true, // Serve docs is local development only
      hidden: isDbtV2, // dbt Core v2 does not support docs generation/serving
    },
    {
      name: 'Clean',
      onClick: () => {
        if (!isDbtConfigured) {
          toast.info('Please configure dbt path in settings');
          return;
        }
        onBeforeExecute?.();
        dbtClean(project);
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Clean the dbt project',
      localOnly: false,
    },
    {
      name: 'Deps',
      onClick: () => {
        if (!isDbtConfigured) {
          toast.info('Please configure dbt path in settings');
          return;
        }
        onBeforeExecute?.();
        dbtDeps(project);
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Install dbt dependencies',
      localOnly: false,
    },
    {
      name: 'Seed',
      onClick: () => {
        if (!isDbtConfigured) {
          toast.info('Please configure dbt path in settings');
          return;
        }
        onBeforeExecute?.();
        dbtSeed(project);
      },
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Seed the dbt project',
      localOnly: false,
    },
    {
      name: 'Run Pipeline',
      onClick: () => {
        setPipelineModal(true);
      },
      leftIcon: <AccountTree sx={{ fontSize: 16 }} />,
      subTitle: 'Run a pipeline on the cloud',
      localOnly: false,
      cloudOnly: true,
      dividerBefore: true,
    },
    {
      name: 'Run Pipeline (Local Runner)',
      onClick: () => {
        if (!settings?.runnerPath) {
          toast.info(
            'Install the local runner first (Settings > Local Runner)',
          );
          return;
        }
        setLocalPipelineModal(true);
      },
      leftIcon: <AccountTree sx={{ fontSize: 16 }} />,
      subTitle: 'Run a pipeline on this machine',
      localOnly: true,
      dividerBefore: true,
    },
  ];

  // Filter menu items based on environment
  // In cloud mode: hide Rosetta layer generation and local development tools
  // In local mode: show all items
  const filteredMenuItems = allMenuItems.filter((item) => {
    if (item.hidden) {
      return false;
    }
    if (environment === 'cloud') {
      return !item.localOnly;
    }
    return !item.cloudOnly;
  });

  let projectTooltipTitle = '';
  if (cloudV2Blocked) {
    projectTooltipTitle =
      'dbt Core v2 is in alpha and not yet supported for cloud runs. Support will be added after the first official v2 release.';
  } else if (!isDbtConfigured) {
    projectTooltipTitle = 'Please configure dbt path in settings';
  }

  return (
    <>
      <SplitButton
        title="Project"
        tooltipTitle={projectTooltipTitle}
        disabled={isRunningDbt || isRunningRosettaDbt || cloudV2Blocked}
        isLoading={isRunningDbt || isRunningRosettaDbt}
        leftIcon={<PlayCircleOutline />}
        height={24}
        menuItems={filteredMenuItems.map((item) => {
          /* eslint-disable @typescript-eslint/no-unused-vars */
          const {
            localOnly: _l,
            cloudOnly: _c,
            hidden: _h,
            ...menuItem
          } = item;
          /* eslint-enable @typescript-eslint/no-unused-vars */
          // dividerBefore is kept — SplitButton supports it
          return menuItem;
        })}
      />
      {openRawLayerModal && project?.path && (
        <RawLayerModal
          isOpen={openRawLayerModal}
          onClose={() => setOpenRawLayerModal(false)}
          path={rawPath}
          project={project}
          processCallback={async (updatedPath) => {
            try {
              onBeforeExecute?.();
              await rosettaDbt(project, {
                command: 'extract',
                commandType: CommandType.DBTNext,
                arguments: new Map([['-o', updatedPath]]),
              } as Command);
            } finally {
              setOpenRawLayerModal(false);
            }
          }}
        />
      )}
      {stagingModal && project?.path && (
        <StagingModal
          isOpen={stagingModal}
          onClose={() => setStagingModal(false)}
          path={stagingPath}
          project={project}
          processCallback={async (updatedPath, selectedFiles) => {
            const args = new Map([['-o', updatedPath]]);
            if (selectedFiles.length > 0) {
              let command = '';
              selectedFiles.forEach((file) => {
                command += `-i "${file}" `;
              });
              args.set(' ', command);
            }
            try {
              onBeforeExecute?.();
              await rosettaDbt(project, {
                command: 'staging',
                commandType: CommandType.DBTNext,
                arguments: args,
              } as Command);
            } finally {
              setStagingModal(false);
            }
          }}
        />
      )}
      {incrementalModal && project?.path && (
        <IncrementalModal
          isOpen={incrementalModal}
          onClose={() => setIncrementalModal(false)}
          path={incrementalPath}
          project={project}
          processCallback={async (updatedPath, selectedFiles) => {
            const args = new Map([['-o', updatedPath]]);
            if (selectedFiles.length > 0) {
              let command = '';
              selectedFiles.forEach((file) => {
                command += `-i "${file}" `;
              });
              args.set(' ', command);
            }
            try {
              onBeforeExecute?.();
              await rosettaDbt(project, {
                commandType: CommandType.DBTNext,
                command: 'incremental',
                arguments: args,
              } as Command);
            } finally {
              setIncrementalModal(false);
            }
          }}
        />
      )}
      {runInCloudModal && (
        <PushToCloudModal
          isOpen={!!runInCloudModal}
          onClose={() => {
            setRunInCloudModal(undefined);
            setPipelineArgs('');
          }}
          project={project}
          command={runInCloudModal}
          initialDbtArguments={
            runInCloudModal === 'pipeline' ? pipelineArgs : undefined
          }
        />
      )}
      {pipelineModal && (
        <PipelineSelectorModal
          isOpen={pipelineModal}
          onClose={() => setPipelineModal(false)}
          project={project}
          onSelect={(pipelineName) => {
            setPipelineModal(false);
            setPipelineArgs(`--pipeline_name ${pipelineName}`);
            setRunInCloudModal('pipeline');
          }}
        />
      )}
      {localPipelineModal && (
        <PipelineSelectorModal
          isOpen={localPipelineModal}
          onClose={() => setLocalPipelineModal(false)}
          project={project}
          onSelect={async (pipelineName) => {
            setLocalPipelineModal(false);
            if (!settings?.runnerPath) {
              toast.error('Local runner is not installed.');
              return;
            }
            const result = await runPipelineLocally({
              binaryPath: settings.runnerPath,
              workspaceDir: project.path,
              pipelineFile: `${pipelineName}.yml`,
              connectionName: connection?.connection?.name,
            });
            if (result.success) {
              toast.success(
                'Pipeline run started. Track progress in Task Manager.',
              );
            } else {
              toast.error(result.error || 'Failed to start the pipeline run');
            }
          }}
        />
      )}
    </>
  );
};
