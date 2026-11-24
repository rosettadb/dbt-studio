/** Canonical component name → React implementation. */
import type React from 'react';
import type { BiImplProps } from './registry.types';
import {
  BiAreaChart,
  BiBarChart,
  BiDonutChart,
  BiLineChart,
  BiPieChart,
  BiScatterPlot,
} from './charts/Charts';
import { BiBigValue, BiDelta, BiValue } from './values/Values';
import { BiDataTable } from './table/DataTable';
import {
  BiButtonGroup,
  BiCheckbox,
  BiDateRange,
  BiDropdown,
  BiNumberInput,
  BiSlider,
  BiTextInput,
} from './inputs/Inputs';
import {
  BiAccordion,
  BiAlert,
  BiBox,
  BiDetails,
  BiGrid,
  BiStack,
  BiTabs,
} from './layout/Layout';

const Nothing: React.FC<BiImplProps> = () => null;

export const BI_COMPONENTS: Record<string, React.FC<BiImplProps>> = {
  BarChart: BiBarChart,
  LineChart: BiLineChart,
  AreaChart: BiAreaChart,
  ScatterPlot: BiScatterPlot,
  PieChart: BiPieChart,
  DonutChart: BiDonutChart,
  Value: BiValue,
  BigValue: BiBigValue,
  Delta: BiDelta,
  DataTable: BiDataTable,
  Column: Nothing,
  Dropdown: BiDropdown,
  DropdownOption: Nothing,
  ButtonGroup: BiButtonGroup,
  ButtonGroupItem: Nothing,
  DateRange: BiDateRange,
  TextInput: BiTextInput,
  NumberInput: BiNumberInput,
  Checkbox: BiCheckbox,
  Slider: BiSlider,
  Grid: BiGrid,
  Tabs: BiTabs,
  Tab: Nothing,
  Accordion: BiAccordion,
  AccordionItem: Nothing,
  Alert: BiAlert,
  Details: BiDetails,
  Box: BiBox,
  Stack: BiStack,
};
