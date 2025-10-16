import React from 'react';
import {
  CloudUploadOutlined,
  PlayCircleOutline,
  StopCircleOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SplitButton } from '../splitButton';
import { icons } from '../../../../assets';
import { Icon } from '../icon';
import { Command, CommandType, Project } from '../../../types/backend';
import { useDbt, useProcess } from '../../hooks';
import { StagingModal, IncrementalModal, RawLayerModal } from '../modals';
import { pathJoin } from '../../services/settings.services';

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
  handleBusinessLayerClick: (path: string) => void;
  onRunOnCloudClick: () => void;
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
  onRunOnCloudClick,
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
    deps: dbtDeps,
    seed: dbtSeed,
  } = useDbt();
  const { start, stop, isRunning } = useProcess();
  const [stagingPath, setStagingPath] = React.useState('');
  const [businessPath, setBusinessPath] = React.useState('');
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
      if (project.businessDir) {
        setBusinessPath(project.businessDir);
      } else {
        const p = await pathJoin(project.path, 'models', 'business');
        setBusinessPath(p);
      }
    };
    loadDefaults();
  }, [project.path]);

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
        menuItems={[
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
          },
          {
            name: 'Business Layer',
            onClick: () => {
              if (!rosettaPath) {
                toast.info('Please configure RosettaDB path in settings');
                return;
              }
              handleBusinessLayerClick(businessPath);
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
            name: 'Run on cloud',
            onClick: () => {
              onRunOnCloudClick();
            },
            leftIcon: <CloudUploadOutlined />,
            subTitle: 'Run on cloud',
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
            name: 'Deps',
            onClick: () => {
              if (!isDbtConfigured) {
                toast.info('Please configure dbt path in settings');
                return;
              }
              dbtDeps(project);
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
    </>
  );
};
