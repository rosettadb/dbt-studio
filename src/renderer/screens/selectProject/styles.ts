import { styled, Box, Typography } from '@mui/material';

export const ProjectSelectionContainer = styled(Box)`
  padding: 0.5rem 2rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

export const HeaderContainer = styled(Box)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  gap: 1rem;
`;

export const SearchContainer = styled(Box)`
  flex-grow: 1;
  max-width: 400px;
`;

export const ProjectsContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-top: 1px solid ${({ theme }) => theme.palette.divider};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  flex: 1;
  overflow-y: auto;
  min-height: 0; /* Critical for Firefox */
`;

export const ProjectCard = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  padding: 2rem;
  margin-top: 2rem;
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
  font-size: 1rem;
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
