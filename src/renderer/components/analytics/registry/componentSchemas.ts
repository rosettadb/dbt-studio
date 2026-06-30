import { z } from 'zod';

const fmtSchema = z
  .enum([
    'usd',
    'eur',
    'gbp',
    'pct',
    '%',
    'k',
    'M',
    'num',
    'id',
    'date',
    'datetime',
    'time',
  ])
  .optional();

const colorSchema = z.string().optional();

const widthSchema = z.union([z.string(), z.number()]).optional();

export const valueSchema = z.object({
  data: z.string().optional(),
  value: z.string().optional(),
  title: z.string().optional(),
  label: z.string().optional(),
  fmt: fmtSchema,
  color: colorSchema,
  redNegatives: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  info: z.string().optional(),
  comparison: z.string().optional(),
  width: widthSchema,
});

export const bigValueSchema = valueSchema;

export const deltaSchema = z.object({
  data: z.string().optional(),
  value: z.string().optional(),
  title: z.string().optional(),
  label: z.string().optional(),
  fmt: fmtSchema,
  color: colorSchema,
  redNegatives: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  comparison: z.string().optional(),
  isMax: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  isMin: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  width: widthSchema,
});

export const dataTableSchema = z.object({
  data: z.string().optional(),
  title: z.string().optional(),
  columns: z.union([z.string(), z.array(z.string())]).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  page_size: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
  search: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  row_shading: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  wrap: z.union([z.literal('true'), z.literal('false'), z.boolean()]).optional(),
  sort: z.string().optional(),
  fmt: fmtSchema,
  width: widthSchema,
  rows: z.union([z.string(), z.number()]).optional(),
});

const chartAxisOptionsSchema = z
  .object({
    title: z.string().optional(),
    min: z.union([z.string(), z.number()]).optional(),
    max: z.union([z.string(), z.number()]).optional(),
  })
  .optional();

export const chartBaseSchema = z.object({
  data: z.string().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  x: z.string().optional(),
  y: z.string().optional(),
  series: z.string().optional(),
  sort: z.string().optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  stacked: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  swap_xy: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  legend: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  labels: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  x_axis_title: z.string().optional(),
  y_axis_title: z.string().optional(),
  x_axis_options: chartAxisOptionsSchema,
  y_axis_options: chartAxisOptionsSchema,
  date_grain: z.string().optional(),
  fmt: fmtSchema,
  width: widthSchema,
  color: colorSchema,
});

export const barChartSchema = chartBaseSchema;
export const lineChartSchema = chartBaseSchema;
export const areaChartSchema = chartBaseSchema;
export const horizontalBarChartSchema = chartBaseSchema;

export const pieChartSchema = chartBaseSchema.extend({
  innerRadius: z.union([z.string(), z.number()]).optional(),
  donut: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
});

export const donutChartSchema = pieChartSchema;

export const scatterChartSchema = chartBaseSchema.extend({
  pointSize: z.union([z.string(), z.number()]).optional(),
  pointShape: z.string().optional(),
});

export const alertSchema = z.object({
  severity: z.enum(['info', 'warning', 'error', 'success']).default('info'),
  title: z.string().optional(),
});

export const accordionSchema = z.object({
  title: z.string().optional(),
  defaultExpanded: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
});

export const tabsSchema = z.object({
  defaultTab: z.union([z.string(), z.number()]).optional(),
});

export const gridSchema = z.object({
  columns: z.union([z.string(), z.number()]).optional(),
  spacing: z.union([z.string(), z.number()]).optional(),
});

export const stackSchema = z.object({
  direction: z.enum(['row', 'column']).optional(),
  spacing: z.union([z.string(), z.number()]).optional(),
});

export const boxSchema = z.object({
  width: widthSchema,
  height: z.union([z.string(), z.number()]).optional(),
  bgcolor: z.string().optional(),
  p: z.union([z.string(), z.number()]).optional(),
  m: z.union([z.string(), z.number()]).optional(),
});

export const buttonGroupSchema = z.object({
  options: z.string().optional(),
  default: z.string().optional(),
  multiple: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  title: z.string().optional(),
});

export const selectSchema = z.object({
  data: z.string().optional(),
  value: z.string().optional(),
  label: z.string().optional(),
  default: z.string().optional(),
  title: z.string().optional(),
});

export const dateRangeSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  title: z.string().optional(),
});

export const checkboxSchema = z.object({
  label: z.string().optional(),
  default: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  title: z.string().optional(),
});

export const numberInputSchema = z.object({
  label: z.string().optional(),
  default: z.union([z.string(), z.number()]).optional(),
  min: z.union([z.string(), z.number()]).optional(),
  max: z.union([z.string(), z.number()]).optional(),
  step: z.union([z.string(), z.number()]).optional(),
  title: z.string().optional(),
});

export const textInputSchema = z.object({
  label: z.string().optional(),
  default: z.string().optional(),
  placeholder: z.string().optional(),
  title: z.string().optional(),
});
