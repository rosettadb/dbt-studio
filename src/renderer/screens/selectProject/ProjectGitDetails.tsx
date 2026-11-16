import React from 'react';
import { icons } from '../../../../assets';
import { Icon } from '../../components';
import { useGetProjectGitSummary } from '../../controllers';
import { ProjectDetailLine, ProjectGitBranchLine, ProjectPath } from './styles';

type ProjectGitDetailsProps = {
  projectPath: string;
};

const ProjectGitDetails: React.FC<ProjectGitDetailsProps> = ({
  projectPath,
}) => {
  const { data: gitSummary, isLoading } = useGetProjectGitSummary(projectPath);

  if (isLoading) {
    return null;
  }

  if (!gitSummary) {
    return <ProjectDetailLine>Not a Git repository</ProjectDetailLine>;
  }

  const { currentBranch } = gitSummary;

  if (!currentBranch) {
    return null;
  }

  return (
    <ProjectGitBranchLine>
      <Icon
        src={icons.gitBranch}
        width={12}
        height={12}
        style={{ display: 'flex', flexShrink: 0 }}
      />
      <ProjectPath title={currentBranch}>{currentBranch}</ProjectPath>
    </ProjectGitBranchLine>
  );
};

export default ProjectGitDetails;
