import React from 'react';
import { render, screen } from '@testing-library/react';

import ProjectGitDetails from '../../../../src/renderer/screens/selectProject/ProjectGitDetails';
import { useGetProjectGitSummary } from '../../../../src/renderer/controllers';

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetProjectGitSummary: jest.fn(),
}));

jest.mock('../../../../src/renderer/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Icon: ({ src }: { src: string }) =>
      createElement('div', { 'data-testid': 'git-icon', 'data-src': src }),
  };
});

jest.mock('../../../../assets', () => ({
  icons: { git: 'git.svg', gitBranch: 'git-branch.svg' },
}));

const mockSummary = (data: unknown, isLoading = false) => {
  (useGetProjectGitSummary as jest.Mock).mockReturnValue({ data, isLoading });
};

const renderDetails = () => render(<ProjectGitDetails projectPath="/repo" />);

describe('ProjectGitDetails', () => {
  it('asks for the Git details of its own project', () => {
    mockSummary({ currentBranch: 'main' });

    renderDetails();

    expect(useGetProjectGitSummary).toHaveBeenCalledWith('/repo');
  });

  it('renders nothing while the summary is loading', () => {
    mockSummary(undefined, true);

    const { container } = renderDetails();

    expect(container).toBeEmptyDOMElement();
  });

  it('says the project is not a Git repository, without a branch icon', () => {
    mockSummary(null);

    renderDetails();

    expect(screen.getByText('Not a Git repository')).toBeInTheDocument();
    expect(screen.queryByTestId('git-icon')).not.toBeInTheDocument();
  });

  it('shows only the active branch name', () => {
    mockSummary({ currentBranch: 'feature/icons' });

    const { container } = renderDetails();

    expect(container).toHaveTextContent(/^feature\/icons$/);
  });

  it('renders nothing when Git cannot name the branch', () => {
    mockSummary({ currentBranch: null });

    const { container } = renderDetails();

    expect(container).toBeEmptyDOMElement();
  });

  it('uses the Git branch icon from the dbt project Git tab', () => {
    mockSummary({ currentBranch: 'main' });

    renderDetails();

    expect(screen.getByTestId('git-icon')).toHaveAttribute(
      'data-src',
      'git-branch.svg',
    );
  });

  it('centres the branch icon on the same line as the branch name', () => {
    mockSummary({ currentBranch: 'main' });

    renderDetails();

    const branchLine = screen.getByTestId('git-icon').parentElement;

    expect(branchLine).toHaveStyle({ display: 'flex', alignItems: 'center' });
    expect(branchLine).toHaveTextContent(/^main$/);
  });
});
