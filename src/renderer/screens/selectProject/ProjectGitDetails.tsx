import React from 'react';
import moment from 'moment';
import { icons } from '../../../../assets';
import { Icon } from '../../components';
import { useGetProjectGitSummary } from '../../controllers';
import { ProjectDetailLine, ProjectGitBranchLine, ProjectPath } from './styles';

type ProjectGitDetailsProps = {
  projectPath: string;
  isCardView: boolean;
};

const joinDetails = (details: (string | null | undefined)[]) =>
  details.filter(Boolean).join(' · ');

const ProjectGitDetails: React.FC<ProjectGitDetailsProps> = ({
  projectPath,
  isCardView,
}) => {
  const { data: gitSummary, isLoading } = useGetProjectGitSummary(projectPath);

  if (isLoading) {
    return null;
  }

  if (!gitSummary) {
    return <ProjectDetailLine>Not a Git repository</ProjectDetailLine>;
  }

  const {
    currentBranch,
    remoteDisplayAddress,
    aheadBehind,
    changedFileCount,
    lastCommit,
  } = gitSummary;

  const aheadBehindText =
    aheadBehind && `↑${aheadBehind.ahead} ↓${aheadBehind.behind}`;
  const changesText =
    changedFileCount === 0 ? 'No changes' : `${changedFileCount} changed`;

  // Cards are narrow, so the remote gets its own line and the author is left out
  const branchLine = joinDetails([
    currentBranch,
    isCardView ? null : remoteDisplayAddress,
    aheadBehindText,
    changesText,
  ]);
  const lastCommitLine =
    lastCommit &&
    joinDetails([
      `"${lastCommit.message}"`,
      isCardView ? null : lastCommit.authorName,
      moment(lastCommit.date).fromNow(),
    ]);

  return (
    <>
      <ProjectGitBranchLine>
        <Icon
          src={icons.gitBranch}
          width={12}
          height={12}
          style={{ display: 'flex', flexShrink: 0 }}
        />
        <ProjectPath title={branchLine}>{branchLine}</ProjectPath>
      </ProjectGitBranchLine>
      {isCardView && remoteDisplayAddress && (
        <ProjectDetailLine title={remoteDisplayAddress}>
          {remoteDisplayAddress}
        </ProjectDetailLine>
      )}
      {lastCommitLine && (
        <ProjectDetailLine title={lastCommitLine}>
          {lastCommitLine}
        </ProjectDetailLine>
      )}
    </>
  );
};

export default ProjectGitDetails;
