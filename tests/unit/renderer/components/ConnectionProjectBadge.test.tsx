/**
 * ConnectionProjectBadge: the project a connection belongs to, in the SQL
 * Editor and Notebooks connection pickers. The active project stands out.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConnectionProjectBadge } from '../../../../src/renderer/components/projectFolders/ConnectionProjectBadge';
import type { Project } from '../../../../src/types/backend';

jest.mock('../../../../src/projectTypes/registry.renderer', () => ({
  projectTypeUiOf: () => ({
    Icon: () => <span data-testid="type-icon" />,
  }),
}));

const project = {
  id: '1',
  name: 'sales_analysis',
  path: '/p',
  createdAt: '',
  type: 'analytics',
} as Project;

describe('ConnectionProjectBadge', () => {
  it('marks the active project with its type icon and name', () => {
    render(<ConnectionProjectBadge project={project} active />);

    const badge = screen.getByTestId('connection-active-project');
    expect(badge).toHaveTextContent('sales_analysis');
    expect(screen.getByTestId('type-icon')).toBeInTheDocument();
  });

  it('shows other linked projects without the active style', () => {
    render(<ConnectionProjectBadge project={project} active={false} />);

    expect(
      screen.queryByTestId('connection-active-project'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('connection-linked-project')).toHaveTextContent(
      'sales_analysis',
    );
  });

  it('shows only the icon when compact', () => {
    render(<ConnectionProjectBadge project={project} active compact />);

    const badge = screen.getByTestId('connection-active-project');
    expect(badge).not.toHaveTextContent('sales_analysis');
    expect(screen.getByTestId('type-icon')).toBeInTheDocument();
  });
});
