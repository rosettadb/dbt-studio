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

const gitSummary = {
  currentBranch: 'main',
  remoteDisplayAddress: 'github.com/org/repo',
  aheadBehind: { ahead: 1, behind: 2 },
  changedFileCount: 3,
  lastCommit: {
    message: 'Add models',
    authorName: 'Jane',
    date: '2026-11-01T10:00:00.000Z',
  },
};

const mockSummary = (data: unknown, isLoading = false) => {
  (useGetProjectGitSummary as jest.Mock).mockReturnValue({ data, isLoading });
};

const renderDetails = (isCardView = false) =>
  render(<ProjectGitDetails projectPath="/repo" isCardView={isCardView} />);

describe('ProjectGitDetails', () => {
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

  it('shows the branch, remote, ahead/behind and changes on one line in list view', () => {
    mockSummary(gitSummary);

    renderDetails();

    expect(
      screen.getByText('main · github.com/org/repo · ↑1 ↓2 · 3 changed'),
    ).toBeInTheDocument();
  });

  it('includes the author in the last commit line in list view', () => {
    mockSummary(gitSummary);

    renderDetails();

    expect(screen.getByText(/^"Add models" · Jane · /)).toBeInTheDocument();
  });

  it('moves the remote to its own line and drops the author in card view', () => {
    mockSummary(gitSummary);

    renderDetails(true);

    expect(screen.getByText('main · ↑1 ↓2 · 3 changed')).toBeInTheDocument();
    expect(screen.getByText('github.com/org/repo')).toBeInTheDocument();
    expect(screen.getByText(/^"Add models" · /)).toBeInTheDocument();
    expect(screen.queryByText(/Jane/)).not.toBeInTheDocument();
  });

  it('says "No changes" when nothing has changed', () => {
    mockSummary({ ...gitSummary, changedFileCount: 0 });

    renderDetails();

    expect(screen.getByText(/No changes$/)).toBeInTheDocument();
  });

  it('leaves out ahead/behind when the branch does not track a remote branch', () => {
    mockSummary({ ...gitSummary, aheadBehind: null });

    renderDetails();

    expect(
      screen.getByText('main · github.com/org/repo · 3 changed'),
    ).toBeInTheDocument();
  });

  it('leaves out the remote line in card view when there is no remote', () => {
    mockSummary({ ...gitSummary, remoteDisplayAddress: null });

    renderDetails(true);

    expect(screen.queryByText('github.com/org/repo')).not.toBeInTheDocument();
  });

  it('leaves out the last commit line when the repository has no commits', () => {
    mockSummary({ ...gitSummary, lastCommit: null });

    renderDetails();

    expect(screen.queryByText(/Add models/)).not.toBeInTheDocument();
    expect(screen.getByText(/^main · /)).toBeInTheDocument();
  });

  it('uses the Git branch icon from the dbt project Git tab', () => {
    mockSummary(gitSummary);

    renderDetails();

    expect(screen.getByTestId('git-icon')).toHaveAttribute(
      'data-src',
      'git-branch.svg',
    );
  });

  it('centres the branch icon on the same line as the branch text', () => {
    mockSummary(gitSummary);

    renderDetails();

    const branchLine = screen.getByTestId('git-icon').parentElement;

    expect(branchLine).toHaveStyle({ display: 'flex', alignItems: 'center' });
    expect(branchLine).toHaveTextContent(/^main · /);
  });
});
