import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { NewProject } from '../../../../src/renderer/components/newProject';
import type { ProjectType } from '../../../../src/types/projectTypes';

jest.mock('../../../../src/renderer/components/dbtModelButtons', () => ({
  ProjectDbtSplitButton: () => null,
}));

jest.mock('../../../../assets', () => ({
  icons: {},
}));

const Wizard: React.FC = () => {
  const [projectType, setProjectType] = React.useState<ProjectType>('dbt');
  return (
    <NewProject
      defaultProjectPath="/projects"
      setDefaultProjectPath={jest.fn()}
      newProject={{ name: '', createTemplateFolders: true }}
      setNewProject={jest.fn()}
      projectType={projectType}
      setProjectType={setProjectType}
      include={[]}
      setInclude={jest.fn()}
      validateName={() => ({ isValid: true })}
      selectedConnection=""
      setSelectedConnection={jest.fn()}
      connectionType="standard"
      setConnectionType={jest.fn()}
      isLoadingConnections={false}
      connections={[]}
      datalakeInstances={[]}
      isLoadingDatalakes={false}
      navigate={jest.fn()}
      getFiles={jest.fn()}
      handleAddProject={jest.fn()}
      setIsAddingProject={jest.fn()}
      renderConnectionIcon={() => null}
    />
  );
};

describe('NewProject type step', () => {
  it('shows the project types as a labelled group of radio buttons', () => {
    render(<Wizard />);

    const group = screen.getByRole('radiogroup', { name: 'Project type' });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /dbt Project/ })).toBeChecked();
  });

  it('lets a focused radio select Analytics', () => {
    render(<Wizard />);

    const analytics = screen.getByRole('radio', { name: /Analytics Project/ });
    analytics.focus();
    expect(analytics).toHaveFocus();

    fireEvent.click(analytics);

    expect(analytics).toBeChecked();
    expect(
      screen.getByRole('radio', { name: /dbt Project/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('heading', { name: 'New Analytics Project' }),
    ).toBeInTheDocument();
  });
});
