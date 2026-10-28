/**
 * AnalyticsPagesTreeView — the Build Static Site button is disabled while the
 * connection has no pages (issue #544).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { AnalyticsPagesTreeView } from '../../../../src/renderer/components/analytics/AnalyticsPagesTreeView';
import type { AnalyticsPage } from '../../../../src/types/analyticsPages';

const mockUseGetAnalyticsPages = jest.fn();

jest.mock(
  '../../../../src/renderer/controllers/analyticsPages.controller',
  () => ({
    useGetAnalyticsPages: (...args: any[]) => mockUseGetAnalyticsPages(...args),
    useCreateAnalyticsPage: () => ({ mutate: jest.fn(), isLoading: false }),
    useUpdateAnalyticsPage: () => ({ mutate: jest.fn(), isLoading: false }),
    useDeleteAnalyticsPage: () => ({ mutate: jest.fn(), isLoading: false }),
  }),
);

jest.mock('../../../../src/renderer/controllers/staticSite.controller', () => ({
  useGetStaticSiteState: () => ({ data: null, refetch: jest.fn() }),
  useDeleteStaticSiteBuild: () => ({ mutate: jest.fn(), isLoading: false }),
}));

jest.mock('../../../../src/renderer/services/staticSite.service', () => ({
  StaticSiteService: { subscribeToBuildProgress: jest.fn(() => () => {}) },
}));

jest.mock(
  '../../../../src/renderer/components/analytics/StaticSiteBuildDialog',
  () => ({ StaticSiteBuildDialog: () => null }),
);

jest.mock(
  '../../../../src/renderer/components/analytics/AnalyticsPageItem',
  () => ({ AnalyticsPageItem: () => null }),
);

const theme = createTheme();
const renderTreeView = () =>
  render(
    <ThemeProvider theme={theme}>
      <AnalyticsPagesTreeView
        connectionId="conn-1"
        activePageId={null}
        onOpenPage={() => {}}
      />
    </ThemeProvider>,
  );

const page: AnalyticsPage = {
  id: 'page-1',
  connectionId: 'conn-1',
  title: 'Test Page',
  routePath: '/test-page',
  markdownContent: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const buildButton = () =>
  screen.getByRole('button', { name: 'Build Static Site' });

describe('AnalyticsPagesTreeView build button', () => {
  it('is disabled with a hint when there are no pages', () => {
    mockUseGetAnalyticsPages.mockReturnValue({ data: [], isLoading: false });
    renderTreeView();

    expect(buildButton()).toBeDisabled();
    // The tooltip text labels the wrapper around the build button
    expect(
      screen.getByLabelText('Create a page first to build the site'),
    ).toBeInTheDocument();
  });

  it('is enabled when there is at least one page', () => {
    mockUseGetAnalyticsPages.mockReturnValue({
      data: [page],
      isLoading: false,
    });
    renderTreeView();

    expect(buildButton()).toBeEnabled();
  });
});
