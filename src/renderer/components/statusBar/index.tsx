import React from 'react';
import {
  StatusBarContainer,
  StatusBarSection,
  StatusBarItem,
  StatusBarDivider,
} from './styles';
import { useGetSelectedProject, useApiKey } from '../../controllers';

export const StatusBar: React.FC = () => {
  const { data: project } = useGetSelectedProject();
  const { data: apiKey } = useApiKey();

  return (
    <StatusBarContainer>
      <StatusBarSection>
        {project?.name && (
          <>
            <StatusBarItem>{project.name}</StatusBarItem>
            <StatusBarDivider />
          </>
        )}
        {apiKey && <StatusBarItem>Connected</StatusBarItem>}
      </StatusBarSection>
    </StatusBarContainer>
  );
};
