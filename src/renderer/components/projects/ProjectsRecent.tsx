import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Box, Typography } from '@mui/material';
import { History } from '@mui/icons-material';
import { useGetProjects, useSelectProject } from '../../controllers';
import {
  ProjectCard,
  ProjectCardContent,
  ProjectInfo,
  ProjectPath,
  ProjectTitle,
  ProjectsContainer,
} from './styles';

const ProjectsRecent: React.FC = () => {
  const navigate = useNavigate();
  const { data: projects = [] } = useGetProjects();
  const { mutateAsync: selectProject } = useSelectProject();

  const recent = useMemo(
    () =>
      projects
        .filter((p) => p.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)),
    [projects],
  );

  return (
    <Box sx={{ p: 2 }} data-testid="projects-recent">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
          Recent
        </Typography>
        <History sx={{ color: 'text.secondary', fontSize: 28 }} />
      </Box>
      {recent.length === 0 ? (
        <Typography color="text.secondary">
          Projects you open will show up here.
        </Typography>
      ) : (
        <ProjectsContainer>
          {recent.map((project) => (
            <ProjectCard
              key={project.id}
              data-testid={`recent-project-${project.name}`}
              onClick={async () => {
                await selectProject({ projectId: project.id });
                navigate('/app/dbt-project');
              }}
            >
              <ProjectCardContent>
                <ProjectInfo>
                  <ProjectTitle variant="body1">{project.name}</ProjectTitle>
                  <ProjectPath>{project.path}</ProjectPath>
                </ProjectInfo>
              </ProjectCardContent>
              <Typography variant="body2" color="text.secondary">
                {formatDistanceToNow(project.lastOpenedAt as number, {
                  addSuffix: true,
                })}
              </Typography>
            </ProjectCard>
          ))}
        </ProjectsContainer>
      )}
    </Box>
  );
};

export default ProjectsRecent;
