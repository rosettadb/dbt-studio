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
import { useAppContext, useDbt, useProcess, useRosettaDBT } from '../../hooks';
import { useRefreshProjectFiles } from '../../hooks/useRefreshProjectFiles';
import { useTabs } from '../../context/TabsProvider';
import {
  useCloudActionStatus,
  useGetConnectionById,
  useGetSettings,
} from '../../controllers';
import { isTerminalActionStatus } from '../../../types/cloudAction';
import {
  StagingModal,
  IncrementalModal,
  RawLayerModal,
  PushToCloudModal,
  PipelineSelectorModal,
  RunWithEnvModal,
} from '../modals';
import { path } from '../../lib/path';

interface ProjectDbtSplitButtonProps {
  project: Project;
}

// Project-level dbt / Rosetta / pipeline actions. Self-contained: it reads
// settings, environment and the project's connection itself, refreshes the
// file tree through the shared query cache, and opens files through the tabs
// store. Which bottom panel surfaces a run is decided by the panels
// subscribing to the CLI / cloud-run / runner stores, not here.
export const ProjectDbtSplitButton: React.FC<ProjectDbtSplitButtonProps> = ({
  project,
}) => {
  const { data: settings } = useGetSettings();
  const { env: environment } = useAppContext();
  const { data: connection } = useGetConnectionById(project.connectionId);
  const refreshProjectFiles = useRefreshProjectFiles();
  const { openFile } = useTabs();

  const rosettaPath = settings?.rosettaPath;
  const dbtPath = settings?.dbtPath;
  const isDbtConfigured = Boolean(dbtPath);

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
    isRunning: isRunningDbt,
  } = useDbt(refreshProjectFiles, (command) => {
    setRunInCloudModal(command);
  });
  const { fn: rosettaDbt, isRunning: isRunningRosettaDbt } = useRosettaDBT(
    async () => {
      // Rosetta writes the generated layer a moment after the CLI returns.
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
      await refreshProjectFiles();
    },
  );
  const { start, stop, isRunning } = useProcess();
  const isDbtV2 = !!settings?.dbtVersion?.startsWith('2.');
  const cloudV2Blocked = environment === 'cloud' && isDbtV2;

  const lastCloudActionId =
    environment === 'cloud' ? (project.lastCloudActionId ?? null) : null;
  const { data: cloudActionStatus } = useCloudActionStatus(lastCloudActionId);
  const isCloudRunActive =
    !!lastCloudActionId &&
    !!cloudActionStatus?.status &&
    !isTerminalActionStatus(cloudActionStatus.status);
  const [stagingPath, setStagingPath] = React.useState('');
  const [rawPath, setRawPath] = React.useState('');
  const [incrementalPath, setIncrementalPath] = React.useState('');
  const [stagingModal, setStagingModal] = React.useState(false);
  const [openRawLayerModal, setOpenRawLayerModal] = React.useState(false);
  const [incrementalModal, setIncrementalModal] = React.useState(false);
  const [pipelineModal, setPipelineModal] = React.useState(false);
  const [pipelineArgs, setPipelineArgs] = React.useState('');
  const [localPipelineModal, setLocalPipelineModal] = React.useState(false);
  const [localPipelineFile, setLocalPipelineFile] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    setRawPath(project.rawLayerDir || path.join(project.path, 'models', 'raw'));
    setStagingPath(
      project.stagingDir || path.join(project.path, 'models', 'staging'),
    );
    setIncrementalPath(
      project.incrementalDir || path.join(project.path, 'models', 'enhanced'),
    );
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
  } else if (isCloudRunActive) {
    projectTooltipTitle = 'A cloud run is already in progress';
  } else if (!isDbtConfigured) {
    projectTooltipTitle = 'Please configure dbt path in settings';
  }

  return (
    <>
      <SplitButton
        title="Project"
        tooltipTitle={projectTooltipTitle}
        disabled={
          isRunningDbt ||
          isRunningRosettaDbt ||
          isCloudRunActive ||
          cloudV2Blocked
        }
        isLoading={isRunningDbt || isRunningRosettaDbt || isCloudRunActive}
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
          mode="cloud"
          project={project}
          onCreated={openFile}
          onSelect={(pipeline) => {
            setPipelineModal(false);
            setPipelineArgs(`--pipeline_name ${pipeline.name}`);
            setRunInCloudModal('pipeline');
          }}
        />
      )}
      {localPipelineModal && (
        <PipelineSelectorModal
          isOpen={localPipelineModal}
          onClose={() => setLocalPipelineModal(false)}
          mode="local"
          project={project}
          onCreated={openFile}
          onSelect={(pipeline) => {
            setLocalPipelineModal(false);
            if (!settings?.runnerPath) {
              toast.error('Local runner is not installed.');
              return;
            }
            const ext = pipeline.path.slice(pipeline.path.lastIndexOf('.'));
            setLocalPipelineFile(`${pipeline.name}${ext}`);
          }}
        />
      )}
      {localPipelineFile && (
        <RunWithEnvModal
          isOpen={!!localPipelineFile}
          onClose={() => setLocalPipelineFile(null)}
          project={project}
          pipelineRelativePath={localPipelineFile}
          connectionName={connection?.connection?.name}
        />
      )}
    </>
  );
};
