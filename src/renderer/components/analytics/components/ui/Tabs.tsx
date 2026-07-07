import React, { useState, Children, isValidElement } from 'react';
import { Tabs as MuiTabs, Tab as MuiTab, Box } from '@mui/material';
import {
  getStringProp,
  getNumberProp,
} from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

interface TabChildProps extends AnalyticsComponentProps {
  chartProps?: ParsedProps;
}

export const AnalyticsTabs: React.FC<
  AnalyticsComponentProps & { chartProps?: ParsedProps }
> = ({ chartProps = {}, children }) => {
  const defaultTab = getNumberProp(chartProps, 'defaultTab', 0) ?? 0;
  const [activeTab, setActiveTab] = useState(defaultTab);

  const tabs: Array<{ title: string; content: React.ReactNode }> = [];
  Children.forEach(children, (child) => {
    if (isValidElement<TabChildProps>(child) && child.props) {
      const tabProps = child.props.chartProps ?? {};
      tabs.push({
        title: getStringProp(tabProps, 'title', `Tab ${tabs.length + 1}`),
        content: child.props.children,
      });
    }
  });

  if (tabs.length === 0) return null;

  const maxTab = Math.max(0, tabs.length - 1);
  const clampedTab = Math.min(activeTab, maxTab);

  return (
    <Box sx={{ mb: 2 }}>
      <MuiTabs
        value={clampedTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
      >
        {tabs.map((tab, i) => (
          <MuiTab
            key={i}
            label={tab.title}
            sx={{ textTransform: 'none', fontSize: '0.85rem' }}
          />
        ))}
      </MuiTabs>
      <Box sx={{ pt: 2 }}>{tabs[clampedTab]?.content}</Box>
    </Box>
  );
};

export const AnalyticsTab: React.FC<AnalyticsComponentProps> = ({ children }) =>
  children;
