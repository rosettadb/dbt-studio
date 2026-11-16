import { styled, Box, Typography } from '@mui/material';

const PROJECTS_LIST_MAX_WIDTH = '800px';

export const ProjectSelectionContainer = styled(Box)`
  padding: 0.5rem 2rem 2rem;
  flex: 1 0 auto; /* Grows with its content so the page itself scrolls */
  display: flex;
  flex-direction: column;
`;

export const ProjectsStickyHeader = styled(Box)`
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  margin-top: -0.5rem; /* Moves ProjectSelectionContainer's top padding inside, so nothing shows above the header */
  padding-top: 0.5rem;
  background-color: ${({ theme }) => theme.palette.background.default};
  /* Paints upward so scrolled projects can't show in the gap above the header */
  box-shadow: 0 -1rem 0 ${({ theme }) => theme.palette.background.default};
`;

export const HeaderContainer = styled(Box)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: ${PROJECTS_LIST_MAX_WIDTH};
  margin: 0 auto 1.5rem;
  gap: 1rem;
`;

export const SearchContainer = styled(Box)`
  flex-grow: 1;
  max-width: 400px;
`;

export const ProjectsContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: ${PROJECTS_LIST_MAX_WIDTH};
  margin: 0 auto;
  gap: 1px;
  border-top: 1px solid ${({ theme }) => theme.palette.divider};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

export const ProjectsCardGrid = styled(Box)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  width: 100%;
  max-width: 992px; /* Exactly 3 columns: 3 x 320px + 2 x 16px gaps */
  margin: 0 auto;
  align-content: start;
  gap: 16px;
`;

export const ProjectGridCard = styled(Box)`
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px;
  cursor: pointer;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 8px;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.palette.action.hover};
  }
`;

export const ProjectGridCardHeader = styled(Box)`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
`;

export const ProjectCard = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: ${({ theme }) => theme.palette.action.hover};
  }
`;

export const ProjectInfo = styled(Box)`
  flex-grow: 1;
  overflow: hidden;
`;

export const ProjectTitle = styled(Typography)`
  font-weight: 500;
  margin-bottom: 4px;
`;

export const ProjectPath = styled(Typography)`
  font-size: 12px;
  color: ${({ theme }) => theme.palette.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const ProjectDetailLine = styled(ProjectPath)`
  margin-top: 2px;
`;

export const ProjectGitBranchLine = styled(Box)`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

export const ConnectionName = styled(Typography)`
  font-size: 11px;
  color: ${({ theme }) => theme.palette.primary.main};
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
`;

export const ProjectActions = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const EmptyStateContainer = styled(Box)`
  text-align: center;
  width: 100%;
  max-width: ${PROJECTS_LIST_MAX_WIDTH};
  padding: 2rem;
  margin: 2rem auto 0;
  border-radius: 8px;
  border: 0.5px solid ${({ theme }) => theme.palette.divider};
  overflow-y: auto;
  flex: 1;
`;

export const EmptyStateIcon = styled(Box)`
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.palette.text.secondary};
  opacity: 0.7;

  svg {
    font-size: 3rem;
  }
`;

export const EmptyStateTitle = styled(Typography)`
  font-weight: 500;
  margin-bottom: 1rem;
  font-size: 1.5rem;
  color: ${({ theme }) => theme.palette.text.primary};
`;

export const EmptyStateDescription = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  margin: 0 auto 2rem;
  line-height: 1.6;
`;

export const TaglineContainer = styled(Box)`
  text-align: center;
  margin-bottom: 1.5rem;
  margin-top: 0.5rem;
  padding: 0.75rem;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
`;

export const TaglineText = styled(Typography)`
  font-size: 1.5rem;
  font-weight: 500;
  color: ${({ theme }) => theme.palette.primary.main};
`;

export const ProjectIcon = styled('img')`
  width: 24px;
  height: 24px;
  margin-right: 12px;
  flex-shrink: 0;
  border-radius: 4px;
  object-fit: contain;
`;

export const ProjectMuiIcon = styled(Box)`
  width: 24px;
  height: 24px;
  margin-right: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const ProjectCardContent = styled(Box)`
  display: flex;
  align-items: center;
  flex-grow: 1;
  overflow: hidden;
`;

export const ConnectionIcon = styled('img')`
  width: 20px;
  height: 20px;
  margin-right: 6px;
  flex-shrink: 0;
  border-radius: 2px;
  object-fit: contain;
`;
