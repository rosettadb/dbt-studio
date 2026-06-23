import React from 'react';
import { z } from 'zod';
import type { ComponentType } from 'react';
import {
  valueSchema,
  bigValueSchema,
  deltaSchema,
  dataTableSchema,
  barChartSchema,
  lineChartSchema,
  areaChartSchema,
  horizontalBarChartSchema,
  pieChartSchema,
  donutChartSchema,
  scatterChartSchema,
  alertSchema,
  accordionSchema,
  tabsSchema,
  gridSchema,
  stackSchema,
  boxSchema,
  buttonGroupSchema,
  selectSchema,
  dateRangeSchema,
} from './componentSchemas';

export type ComponentCategory =
  | 'values'
  | 'tables'
  | 'charts'
  | 'maps'
  | 'ui'
  | 'inputs'
  | 'logic';

export interface AnalyticsComponentProps {
  data?: Record<string, unknown>[];
  queryCache?: Record<string, Record<string, unknown>[]>;
  queryStatuses?: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export type AnalyticsComponentDefinition = {
  name: string;
  aliases?: string[];
  category: ComponentCategory;
  description: string;
  schema: z.ZodObject<any>;
  requiresData?: boolean;
  supportsContent?: boolean;
  render?: ComponentType<AnalyticsComponentProps>;
  /**
   * Placeholder renderer shown when the actual component is not yet implemented.
   */
  notImplemented?: boolean;
};

const registry = new Map<string, AnalyticsComponentDefinition>();

function register(def: AnalyticsComponentDefinition): void {
  registry.set(def.name, def);
  if (def.aliases) {
    def.aliases.forEach((alias) => {
      registry.set(alias, def);
    });
  }
}

register({
  name: 'Value',
  category: 'values',
  description: 'Display a single value with optional formatting.',
  schema: valueSchema,
  requiresData: true,
});

register({
  name: 'BigValue',
  category: 'values',
  description:
    'Display a prominent value with a label, optional formatting, and comparison.',
  schema: bigValueSchema,
  requiresData: true,
});

register({
  name: 'Delta',
  category: 'values',
  description: 'Display a value with a delta/change indicator.',
  schema: deltaSchema,
  requiresData: true,
});

register({
  name: 'DataTable',
  category: 'tables',
  description: 'Display query results in an interactive, sortable table.',
  schema: dataTableSchema,
  requiresData: true,
});

register({
  name: 'BarChart',
  category: 'charts',
  description: 'Vertical bar chart for comparing categorical values.',
  schema: barChartSchema,
  requiresData: true,
});

register({
  name: 'HorizontalBarChart',
  category: 'charts',
  description: 'Horizontal bar chart for comparing categorical values.',
  schema: horizontalBarChartSchema,
  requiresData: true,
});

register({
  name: 'LineChart',
  category: 'charts',
  description: 'Line chart for showing trends over time or sequential data.',
  schema: lineChartSchema,
  requiresData: true,
});

register({
  name: 'AreaChart',
  category: 'charts',
  description: 'Area chart for emphasizing volume or magnitude over time.',
  schema: areaChartSchema,
  requiresData: true,
});

register({
  name: 'PieChart',
  category: 'charts',
  description: 'Pie chart showing proportions of a whole.',
  schema: pieChartSchema,
  requiresData: true,
});

register({
  name: 'DonutChart',
  category: 'charts',
  description: 'Donut chart with a center hole for proportional data.',
  schema: donutChartSchema,
  requiresData: true,
});

register({
  name: 'ScatterChart',
  category: 'charts',
  description: 'Scatter chart for showing correlation between two variables.',
  schema: scatterChartSchema,
  requiresData: true,
});

register({
  name: 'Alert',
  category: 'ui',
  description: 'Display an alert banner with a severity level.',
  schema: alertSchema,
  supportsContent: true,
});

register({
  name: 'Accordion',
  category: 'ui',
  description: 'Collapsible accordion panel.',
  schema: accordionSchema,
  supportsContent: true,
});

register({
  name: 'Tabs',
  category: 'ui',
  description: 'Tabbed container for organizing content.',
  schema: tabsSchema,
  supportsContent: true,
});

register({
  name: 'Tab',
  category: 'ui',
  description: 'A single tab within a Tabs component.',
  schema: z.object({
    title: z.string().optional(),
  }),
  supportsContent: true,
});

register({
  name: 'Grid',
  category: 'ui',
  description: 'CSS grid layout container.',
  schema: gridSchema,
  supportsContent: true,
});

register({
  name: 'Stack',
  category: 'ui',
  description: 'Flexbox stack layout container.',
  schema: stackSchema,
  supportsContent: true,
});

register({
  name: 'Box',
  category: 'ui',
  description: 'Generic box container.',
  schema: boxSchema,
  supportsContent: true,
});

register({
  name: 'ButtonGroup',
  category: 'inputs',
  description: 'Toggle button group for selecting options.',
  schema: buttonGroupSchema,
  requiresData: true,
});

register({
  name: 'Select',
  category: 'inputs',
  description: 'Dropdown select input.',
  schema: selectSchema,
  requiresData: true,
});

register({
  name: 'DateRange',
  category: 'inputs',
  description: 'Date range picker with start and end dates.',
  schema: dateRangeSchema,
});

export function getComponentDefinition(
  name: string,
): AnalyticsComponentDefinition | undefined {
  return registry.get(name);
}

export function getAllComponentDefinitions(): AnalyticsComponentDefinition[] {
  return Array.from(registry.values()).filter(
    (def, index, self) => self.findIndex((d) => d.name === def.name) === index,
  );
}

export function getComponentsByCategory(
  category: ComponentCategory,
): AnalyticsComponentDefinition[] {
  return getAllComponentDefinitions().filter(
    (def) => def.category === category,
  );
}

export function getTier1ComponentNames(): string[] {
  return [
    'Value',
    'BigValue',
    'Delta',
    'DataTable',
    'LineChart',
    'BarChart',
    'AreaChart',
    'PieChart',
    'DonutChart',
    'ScatterChart',
    'Alert',
    'Accordion',
    'Tabs',
    'Grid',
    'Stack',
    'Box',
    'ButtonGroup',
    'Select',
    'DateRange',
  ];
}

export function validateComponentProps(
  componentName: string,
  props: Record<string, unknown>,
):
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string } {
  const def = getComponentDefinition(componentName);
  if (!def) {
    return {
      success: false,
      error: `Unknown component: ${componentName}`,
    };
  }
  try {
    const parsed = def.schema.parse(props);
    return { success: true, data: parsed };
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const messages = err.errors.map(
        (e) => `"${e.path.join('.')}": ${e.message}`,
      );
      return {
        success: false,
        error: `<${componentName}> ${messages.join('; ')}`,
      };
    }
    return {
      success: false,
      error: `Validation failed for <${componentName}>`,
    };
  }
}

export function isComponentName(name: string): boolean {
  return registry.has(name);
}

export { registry as _internalRegistry };
