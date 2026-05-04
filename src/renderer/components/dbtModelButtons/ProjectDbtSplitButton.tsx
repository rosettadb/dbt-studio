import React from 'react';
import { PlayCircleOutline, StopCircleOutlined } from '@mui/icons-material';
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
import { useDbt, useProcess } from '../../hooks';
import {
  StagingModal,
  IncrementalModal,
  RawLayerModal,
  PushToCloudModal,
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
  const [stagingPath, setStagingPath] = React.useState('');
  const [rawPath, setRawPath] = React.useState('');
  const [incrementalPath, setIncrementalPath] = React.useState('');
  const [stagingModal, setStagingModal] = React.useState(false);
  const [openRawLayerModal, setOpenRawLayerModal] = React.useState(false);
  const [incrementalModal, setIncrementalModal] = React.useState(false);

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
  const allMenuItems = [
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
  ];

  // Filter menu items based on environment
  // In cloud mode: hide Rosetta layer generation and local development tools
  // In local mode: show all items
  const filteredMenuItems = allMenuItems.filter((item) => {
    if (environment === 'cloud') {
      return !item.localOnly;
    }
    return true; // Show all items in local environment
  });

  return (
    <>
      <SplitButton
        title="Project"
        tooltipTitle={
          isDbtConfigured ? '' : 'Please configure dbt path in settings'
        }
        disabled={isRunningDbt || isRunningRosettaDbt}
        isLoading={isRunningDbt || isRunningRosettaDbt}
        leftIcon={<PlayCircleOutline />}
        height={24}
        menuItems={filteredMenuItems.map((item) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { localOnly, ...menuItem } = item;
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
            await rosettaDbt(project, {
              command: 'extract',
              commandType: CommandType.DBTNext,
              arguments: new Map([['-o', updatedPath]]),
            } as Command);
            setOpenRawLayerModal(false);
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
            await rosettaDbt(project, {
              command: 'staging',
              commandType: CommandType.DBTNext,
              arguments: args,
            } as Command);
            setStagingModal(false);
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
            await rosettaDbt(project, {
              commandType: CommandType.DBTNext,
              command: 'incremental',
              arguments: args,
            } as Command);
            setIncrementalModal(false);
          }}
        />
      )}
      {runInCloudModal && (
        <PushToCloudModal
          isOpen={!!runInCloudModal}
          onClose={() => setRunInCloudModal(undefined)}
          project={project}
          command={runInCloudModal}
        />
      )}
    </>
  );
};
