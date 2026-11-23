/* eslint-disable react/jsx-props-no-spreading -- shared Recharts axis/series settings are spread onto several chart types */
/**
 * BarChart, LineChart, AreaChart, ScatterPlot, PieChart and DonutChart on
 * one Recharts foundation. Every attribute in the component spec is wired.
 */
import React, { useMemo } from 'react';
import { useTheme } from '@mui/material';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatAxisValue, formatDateForGrain, formatValue } from '../engine';
import type { BiImplProps } from '../registry.types';
import {
  propArray,
  propBool,
  propColumns,
  propNumber,
  propString,
} from '../props';
import { ChartFrame } from './ChartFrame';
import {
  buildChartModel,
  buildPieModel,
  buildScatterModel,
  DEFAULT_PALETTE,
} from './chartModel';

function palette(props: Record<string, unknown>): string[] {
  const custom = propArray(props, 'colorPalette')?.map(String).filter(Boolean);
  if (custom && custom.length) return custom;
  const single = propString(props, 'color');
  return single ? [single, ...DEFAULT_PALETTE] : DEFAULT_PALETTE;
}

function axisOptions(
  props: Record<string, unknown>,
  key: 'xAxisOptions' | 'yAxisOptions',
) {
  const v = props[key];
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

interface CommonChartSettings {
  title?: string;
  subtitle?: string;
  height?: number;
  xAxisTitle?: string;
  yAxisTitle?: string;
  xFmt?: string;
  yFmt?: string;
  labels: boolean;
  legend?: boolean;
  yMin?: number;
  yMax?: number;
  colors: string[];
}

function commonSettings(props: Record<string, unknown>): CommonChartSettings {
  const xo = axisOptions(props, 'xAxisOptions');
  const yo = axisOptions(props, 'yAxisOptions');
  const num = (v: unknown) =>
    v === undefined || v === null || v === '' ? undefined : Number(v);
  return {
    title: propString(props, 'title'),
    subtitle: propString(props, 'subtitle'),
    height: propNumber(props, 'chartAreaHeight'),
    xAxisTitle:
      propString(props, 'xAxisTitle') ?? (xo.title as string | undefined),
    yAxisTitle:
      propString(props, 'yAxisTitle') ?? (yo.title as string | undefined),
    xFmt: propString(props, 'xFmt'),
    yFmt: propString(props, 'yFmt'),
    labels: propBool(props, 'labels'),
    legend: props.legend === undefined ? undefined : propBool(props, 'legend'),
    yMin: propNumber(props, 'yMin') ?? num(yo.min),
    yMax: propNumber(props, 'yMax') ?? num(yo.max),
    colors: palette(props),
  };
}

function useAxisStyle() {
  const theme = useTheme();
  return {
    tick: { fontSize: 11, fill: theme.palette.text.secondary },
    grid: theme.palette.divider,
    tooltip: {
      contentStyle: {
        background: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        fontSize: 12,
      },
    },
  };
}

/**
 * Value-axis domain. Bars and areas start at zero (as in Evidence); lines
 * and scatters fit the data. An explicit yMax is respected exactly.
 */
function domain(
  min: number | undefined,
  max: number | undefined,
  zeroBased: boolean,
): [number | string, number | string] {
  let lower: number | string = min ?? (zeroBased ? 0 : 'auto');
  if (lower === 'auto' && max !== undefined) lower = 'dataMin';
  return [lower, max ?? 'auto'];
}

type CartesianKind = 'bar' | 'line' | 'area';

const CartesianChart: React.FC<BiImplProps & { kind: CartesianKind }> = ({
  props,
  data = [],
  kind,
}) => {
  const style = useAxisStyle();
  const s = commonSettings(props);
  const swap = kind === 'bar' && propBool(props, 'swapXY');
  const typeProp = propString(props, 'type');
  const stackedFlag =
    props.stacked === undefined ? undefined : propBool(props, 'stacked');
  let type: 'grouped' | 'stacked' | 'stacked100' =
    typeProp === 'grouped' || typeProp === 'stacked100' ? typeProp : 'stacked';
  if (stackedFlag === false) type = 'grouped';
  if (kind === 'line') type = 'grouped';

  const sortProp = props.sort;
  let sort: boolean | 'asc' | 'desc' = kind === 'bar';
  if (sortProp === 'asc' || sortProp === 'desc') sort = sortProp;
  else if (sortProp !== undefined) sort = propBool(props, 'sort');

  const model = useMemo(
    () =>
      buildChartModel(data, {
        x: propString(props, 'x'),
        y: propColumns(props, 'y'),
        series: propString(props, 'series'),
        sort,
        limit: propNumber(props, 'limit'),
        type,
      }),
    [data, props, sort, type],
  );

  const yFmt =
    type === 'stacked100' ? 'pct0' : (s.yFmt ?? model.valueColumns[0]);
  const formatY = (v: unknown) =>
    type === 'stacked100' ? formatValue(v, 'pct0') : formatAxisValue(v, s.yFmt);
  const formatX = (v: unknown) => {
    if (s.xFmt) return formatValue(v, s.xFmt);
    if (model.xGrain) return formatDateForGrain(v, model.xGrain);
    return String(v);
  };
  const formatXLong = (v: unknown) => {
    if (s.xFmt) return formatValue(v, s.xFmt);
    if (model.xGrain) return formatDateForGrain(v, model.xGrain, true);
    return String(v);
  };
  const tooltipValue = (v: unknown) =>
    type === 'stacked100'
      ? formatValue(v, 'pct1')
      : formatValue(v, s.yFmt, model.valueColumns[0]);
  const showLegend = s.legend ?? model.seriesKeys.length > 1;
  const stackId = type === 'grouped' ? undefined : 'stack';
  const margin = {
    top: s.labels ? 20 : 10,
    right: s.labels && swap ? 64 : 20,
    left: 10,
    bottom: s.xAxisTitle ? 20 : 5,
  };

  const categoryAxisProps = {
    dataKey: model.x,
    tick: style.tick,
    tickFormatter: formatX,
    minTickGap: 16,
    interval: 'preserveStartEnd' as const,
    label: s.xAxisTitle
      ? {
          value: s.xAxisTitle,
          position: swap ? 'insideLeft' : 'insideBottom',
          offset: -10,
          angle: swap ? -90 : 0,
          fontSize: 11,
        }
      : undefined,
  } as const;
  const valueAxisProps = {
    tick: style.tick,
    tickFormatter: formatY,
    domain: domain(s.yMin, s.yMax, kind !== 'line'),
    allowDataOverflow: s.yMin !== undefined || s.yMax !== undefined,
    label: s.yAxisTitle
      ? {
          value: s.yAxisTitle,
          angle: swap ? 0 : -90,
          position: swap ? 'insideBottom' : 'insideLeft',
          offset: swap ? -10 : 0,
          fontSize: 11,
        }
      : undefined,
  } as const;

  const series = model.seriesKeys.map((key, i) => {
    const color = s.colors[i % s.colors.length];
    const label = s.labels ? (
      <LabelList
        dataKey={key}
        position={swap ? 'right' : 'top'}
        formatter={(v: unknown) => formatValue(v, yFmt)}
        style={{ fontSize: 10 }}
      />
    ) : null;
    if (kind === 'bar') {
      return (
        <Bar
          key={key}
          dataKey={key}
          name={key}
          fill={color}
          stackId={stackId}
          isAnimationActive={false}
        >
          {label}
        </Bar>
      );
    }
    if (kind === 'line') {
      return (
        <Line
          key={key}
          dataKey={key}
          name={key}
          stroke={color}
          strokeWidth={2}
          dot={propBool(props, 'markers') ? { r: 3 } : false}
          type={propBool(props, 'step') ? 'stepAfter' : 'monotone'}
          isAnimationActive={false}
          connectNulls
        >
          {label}
        </Line>
      );
    }
    return (
      <Area
        key={key}
        dataKey={key}
        name={key}
        stroke={color}
        fill={color}
        fillOpacity={0.35}
        stackId={stackId}
        type="monotone"
        isAnimationActive={false}
      >
        {label}
      </Area>
    );
  });

  const shared = (
    <>
      <CartesianGrid
        strokeDasharray="3 3"
        stroke={style.grid}
        vertical={false}
      />
      {swap ? (
        <>
          <XAxis type="number" {...valueAxisProps} />
          <YAxis type="category" width={110} {...categoryAxisProps} />
        </>
      ) : (
        <>
          <XAxis {...categoryAxisProps} />
          <YAxis width={60} {...valueAxisProps} />
        </>
      )}
      <Tooltip
        formatter={(v: unknown) => tooltipValue(v)}
        labelFormatter={(v: unknown) => formatXLong(v)}
        {...style.tooltip}
      />
      {showLegend && (
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: s.xAxisTitle ? 18 : 4 }}
        />
      )}
      {series}
    </>
  );

  let chart: React.ReactElement;
  if (kind === 'bar') {
    chart = (
      <BarChart
        data={model.data}
        layout={swap ? 'vertical' : 'horizontal'}
        margin={margin}
      >
        {shared}
      </BarChart>
    );
  } else if (kind === 'line') {
    chart = (
      <LineChart data={model.data} margin={margin}>
        {shared}
      </LineChart>
    );
  } else {
    chart = (
      <AreaChart
        data={model.data}
        margin={margin}
        stackOffset={type === 'stacked100' ? 'expand' : 'none'}
      >
        {shared}
      </AreaChart>
    );
  }

  return (
    <ChartFrame
      title={s.title}
      subtitle={s.subtitle}
      height={s.height}
      empty={model.empty}
    >
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </ChartFrame>
  );
};

export const BiBarChart: React.FC<BiImplProps> = (p) => (
  <CartesianChart {...p} kind="bar" />
);
export const BiLineChart: React.FC<BiImplProps> = (p) => (
  <CartesianChart {...p} kind="line" />
);
export const BiAreaChart: React.FC<BiImplProps> = (p) => (
  <CartesianChart {...p} kind="area" />
);

export const BiScatterPlot: React.FC<BiImplProps> = ({ props, data = [] }) => {
  const style = useAxisStyle();
  const s = commonSettings(props);
  const model = useMemo(
    () =>
      buildScatterModel(
        data,
        propString(props, 'x'),
        propColumns(props, 'y')[0],
        propString(props, 'series'),
      ),
    [data, props],
  );
  const pointSize = propNumber(props, 'pointSize') ?? 6;
  const showLegend = s.legend ?? model.groups.length > 1;
  return (
    <ChartFrame
      title={s.title}
      subtitle={s.subtitle}
      height={s.height}
      empty={model.groups.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{
            top: 10,
            right: 20,
            left: 10,
            bottom: s.xAxisTitle ? 20 : 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={style.grid} />
          <XAxis
            type="number"
            dataKey={model.x}
            name={model.x}
            tick={style.tick}
            tickFormatter={(v) => formatAxisValue(v, s.xFmt)}
            domain={['auto', 'auto']}
            label={
              s.xAxisTitle
                ? {
                    value: s.xAxisTitle,
                    position: 'insideBottom',
                    offset: -10,
                    fontSize: 11,
                  }
                : undefined
            }
          />
          <YAxis
            type="number"
            dataKey={model.y}
            name={model.y}
            width={60}
            tick={style.tick}
            tickFormatter={(v) => formatAxisValue(v, s.yFmt)}
            domain={domain(s.yMin, s.yMax, false)}
            allowDataOverflow={s.yMin !== undefined || s.yMax !== undefined}
            label={
              s.yAxisTitle
                ? {
                    value: s.yAxisTitle,
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 11,
                  }
                : undefined
            }
          />
          <Tooltip
            formatter={(v: unknown, name: unknown) =>
              formatValue(v, name === model.x ? s.xFmt : s.yFmt, String(name))
            }
            {...style.tooltip}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: s.xAxisTitle ? 18 : 4 }}
            />
          )}
          {model.groups.map((group, i) => (
            <Scatter
              key={group.key}
              name={group.key}
              data={group.points}
              fill={s.colors[i % s.colors.length]}
              shape="circle"
              isAnimationActive={false}
              {...({ r: pointSize / 2 } as object)}
            >
              {s.labels && (
                <LabelList
                  dataKey={model.y}
                  position="top"
                  style={{ fontSize: 10 }}
                  formatter={(v: unknown) => formatValue(v, s.yFmt)}
                />
              )}
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
};

const PieBase: React.FC<BiImplProps & { donut: boolean }> = ({
  props,
  data = [],
  donut,
}) => {
  const s = commonSettings(props);
  const slices = useMemo(
    () =>
      buildPieModel(
        data,
        propString(props, 'x'),
        propColumns(props, 'y')[0],
        propNumber(props, 'limit'),
      ),
    [data, props],
  );
  const isDonut = donut || propBool(props, 'donut');
  const inner = propNumber(props, 'innerRadius') ?? (isDonut ? 55 : 0);
  const showLegend = s.legend ?? true;
  const total = slices.reduce((sum, sl) => sum + sl.value, 0);
  return (
    <ChartFrame
      title={s.title}
      subtitle={s.subtitle}
      height={s.height}
      empty={slices.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={`${inner}%`}
            outerRadius="80%"
            isAnimationActive={false}
            label={
              s.labels
                ? ({ value }: { value: number }) =>
                    `${formatValue(value, s.yFmt)} (${formatValue(total ? value / total : 0, 'pct0')})`
                : undefined
            }
          >
            {slices.map((slice, i) => (
              <Cell key={slice.name} fill={s.colors[i % s.colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: unknown) => formatValue(v, s.yFmt)} />
          {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        </RechartsPieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
};

export const BiPieChart: React.FC<BiImplProps> = (p) => (
  <PieBase {...p} donut={false} />
);
export const BiDonutChart: React.FC<BiImplProps> = (p) => (
  <PieBase {...p} donut />
);
