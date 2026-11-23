/** Value, BigValue and Delta. */
import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { formatValue } from '../engine';
import type { BiImplProps, Row } from '../registry.types';
import { propBool, propNumber, propString } from '../props';
import { toNumber } from '../charts/chartModel';

const POSITIVE = '#2e7d32';
const NEGATIVE = '#c62828';
const NEUTRAL = '#757575';

function pickRow(
  data: Row[] | undefined,
  props: Record<string, unknown>,
): Row | undefined {
  if (!data || data.length === 0) return undefined;
  const index = propNumber(props, 'row') ?? 0;
  return data[index < 0 ? data.length + index : index];
}

function firstColumn(row: Row | undefined): string | undefined {
  return row ? Object.keys(row)[0] : undefined;
}

export function humanize(column: string): string {
  return column
    .replace(/_/g, ' ')
    .replace(/\b(usd|eur|gbp|pct)\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Color for a change, honoring downIsGood and a neutral band. */
export function deltaColor(
  n: number | null,
  downIsGood: boolean,
  neutralMin?: number,
  neutralMax?: number,
): string {
  if (n === null || n === 0) return NEUTRAL;
  if (
    neutralMin !== undefined &&
    neutralMax !== undefined &&
    n >= neutralMin &&
    n <= neutralMax
  ) {
    return NEUTRAL;
  }
  const good = downIsGood ? n < 0 : n > 0;
  return good ? POSITIVE : NEGATIVE;
}

export function deltaSymbol(n: number | null): string {
  if (n === null || n === 0) return '';
  return n > 0 ? '▲' : '▼';
}

export const BiValue: React.FC<BiImplProps> = ({ props, data, inline }) => {
  const row = pickRow(data, props);
  const column = propString(props, 'column') ?? firstColumn(row);
  if (!row || !column) {
    return (
      <Typography component="span" variant="body2" color="text.disabled">
        {propString(props, 'placeholder') ?? '–'}
      </Typography>
    );
  }
  const raw = row[column];
  const n = toNumber(raw);
  const text = formatValue(raw, propString(props, 'fmt'), column);
  const color =
    propBool(props, 'redNegatives') && n !== null && n < 0
      ? NEGATIVE
      : propString(props, 'color');
  const label = propString(props, 'title');

  const value = (
    <Typography
      component="span"
      variant="body2"
      fontWeight={600}
      sx={{ color: color ?? 'inherit', fontSize: 'inherit' }}
      data-testid="bi-value"
    >
      {text}
    </Typography>
  );
  if (inline) return value;
  return (
    <Typography variant="body2" sx={{ my: 1 }}>
      {label && (
        <Typography
          component="span"
          variant="body2"
          color="text.secondary"
          sx={{ mr: 1 }}
        >
          {label}:
        </Typography>
      )}
      {value}
    </Typography>
  );
};

export const BiDelta: React.FC<BiImplProps> = ({ props, data, inline }) => {
  const row = pickRow(data, props);
  const column = propString(props, 'column') ?? firstColumn(row);
  if (!row || !column) {
    return (
      <Typography component="span" variant="body2" color="text.disabled">
        –
      </Typography>
    );
  }
  let n = toNumber(row[column]);
  const comparison = propString(props, 'comparison');
  if (comparison && n !== null) {
    const c = toNumber(row[comparison]);
    n = c === null ? n : n - c;
  }
  const downIsGood = propBool(props, 'downIsGood');
  const color = deltaColor(
    n,
    downIsGood,
    propNumber(props, 'neutralMin'),
    propNumber(props, 'neutralMax'),
  );
  const showSymbol = propBool(props, 'showSymbol', true);
  const showValue = propBool(props, 'showValue', true);
  const chip = propBool(props, 'chip');
  const symbol = deltaSymbol(n);
  const fmt = propString(props, 'fmt');
  const valueText = n === null ? '–' : formatValue(Math.abs(n), fmt, column);
  const text = propString(props, 'text');
  const label = propString(props, 'title');

  const body = (
    <Typography
      component="span"
      variant="body2"
      data-testid="bi-delta"
      sx={{
        color: chip ? '#fff' : color,
        bgcolor: chip ? color : 'transparent',
        px: chip ? 0.75 : 0,
        py: chip ? 0.1 : 0,
        borderRadius: chip ? 1 : 0,
        fontWeight: 600,
        fontSize: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {showSymbol && symbol ? `${symbol} ` : ''}
      {showValue ? valueText : ''}
      {text ? ` ${text}` : ''}
    </Typography>
  );
  if (inline) return body;
  return (
    <Box sx={{ my: 1 }}>
      {label && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {label}
        </Typography>
      )}
      {body}
    </Box>
  );
};

export const BiBigValue: React.FC<BiImplProps> = ({ props, data }) => {
  const row = pickRow(data, props);
  const column = propString(props, 'value') ?? firstColumn(row);
  const title = propString(props, 'title') ?? (column ? humanize(column) : '');
  const minWidth = propString(props, 'minWidth') ?? 0;
  const info = propString(props, 'info');

  const raw = row && column ? row[column] : undefined;
  const n = toNumber(raw);
  const valueText =
    row && column ? formatValue(raw, propString(props, 'fmt'), column) : '–';
  const valueColor =
    propBool(props, 'redNegatives') && n !== null && n < 0
      ? NEGATIVE
      : undefined;

  const comparisonCol = propString(props, 'comparison');
  const comparisonRaw = row && comparisonCol ? row[comparisonCol] : undefined;
  const comparisonN = toNumber(comparisonRaw);
  const asDelta = propBool(props, 'comparisonDelta', true);
  const comparisonFmt = propString(props, 'comparisonFmt');
  const comparisonTitle = propString(props, 'comparisonTitle');
  const downIsGood = propBool(props, 'downIsGood');

  let comparison: React.ReactNode = null;
  if (comparisonCol && row) {
    if (asDelta && comparisonN !== null) {
      const color = deltaColor(comparisonN, downIsGood);
      const symbol = deltaSymbol(comparisonN);
      comparison = (
        <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
          {symbol}{' '}
          {formatValue(Math.abs(comparisonN), comparisonFmt, comparisonCol)}
          {comparisonTitle && (
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              sx={{ ml: 0.5, fontWeight: 400 }}
            >
              {comparisonTitle}
            </Typography>
          )}
        </Typography>
      );
    } else {
      comparison = (
        <Typography variant="caption" color="text.secondary">
          {formatValue(comparisonRaw, comparisonFmt, comparisonCol)}
          {comparisonTitle ? ` ${comparisonTitle}` : ''}
        </Typography>
      );
    }
  }

  return (
    <Box
      data-testid="bi-bigvalue"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minWidth,
        height: '100%',
        boxSizing: 'border-box',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        px: 2,
        py: 1.5,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        {title}
        {info && (
          <Tooltip title={info}>
            <InfoOutlined sx={{ fontSize: 13, cursor: 'help' }} />
          </Tooltip>
        )}
      </Typography>
      <Typography
        variant="h5"
        fontWeight={600}
        sx={{ lineHeight: 1.3, color: valueColor }}
        data-testid="bi-bigvalue-value"
      >
        {valueText}
      </Typography>
      {comparison}
    </Box>
  );
};
