/** DataTable with Column children: search, sort, paging, totals, formats. */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { Panel } from '../ui/Panel';
import { canonicalComponentName, ComponentNode } from '../engine';
import type { BiImplProps, Row } from '../registry.types';
import {
  propBool,
  propColumns,
  propNumber,
  propString,
  resolveComponent,
} from '../props';
import { useBiPage, useBiScope } from '../context';
import { humanize, deltaColor, deltaSymbol } from '../values/Values';
import { toNumber } from '../charts/chartModel';
import {
  colorScale,
  ColumnConfig,
  defaultAlign,
  filterRows,
  formatCell,
  parseSort,
  SortState,
  sortRows,
  totalFor,
} from './tableModel';

function columnConfigs(
  node: ComponentNode,
  rows: Row[],
  props: Record<string, unknown>,
  resolve: (child: ComponentNode) => Record<string, unknown>,
): ColumnConfig[] {
  const children = node.children.filter(
    (c): c is ComponentNode =>
      c.type === 'component' && canonicalComponentName(c.tag) === 'Column',
  );
  if (children.length > 0) {
    return children
      .map((child) => {
        const p = resolve(child);
        const id = propString(p, 'id');
        if (!id) return null;
        const align = propString(p, 'align');
        const contentType = propString(p, 'contentType');
        return {
          id,
          title: propString(p, 'title') ?? humanize(id),
          fmt: propString(p, 'fmt'),
          align:
            align === 'left' || align === 'center' || align === 'right'
              ? align
              : undefined,
          totalAgg: propString(p, 'totalAgg'),
          totalFmt: propString(p, 'totalFmt'),
          contentType:
            contentType === 'delta' || contentType === 'colorscale'
              ? contentType
              : undefined,
          downIsGood: propBool(p, 'downIsGood'),
          redNegatives: propBool(p, 'redNegatives'),
          wrap: propBool(p, 'wrap'),
          colorMax: propNumber(p, 'colorMax'),
        } as ColumnConfig;
      })
      .filter((c): c is ColumnConfig => c !== null);
  }
  const listed = propColumns(props, 'columns');
  let ids = listed;
  if (!ids.length && rows.length) ids = Object.keys(rows[0]);
  return ids.map((id) => ({ id, title: humanize(id) || id }));
}

export const BiDataTable: React.FC<BiImplProps> = ({
  node,
  props,
  data = [],
}) => {
  const page = useBiPage();
  const locals = useBiScope();
  const limit = propNumber(props, 'limit');
  const rows = useMemo(
    () => (limit ? data.slice(0, limit) : data),
    [data, limit],
  );
  const columns = useMemo(
    () =>
      columnConfigs(
        node,
        rows,
        props,
        (child) => resolveComponent(child, page, locals).props,
      ),
    [node, rows, props, page, locals],
  );
  const pageSize = propNumber(props, 'rows') ?? 10;
  const searchable = propBool(props, 'search');
  const sortable = propBool(props, 'sortable', true);
  const tableFmt = propString(props, 'fmt');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(() =>
    parseSort(propString(props, 'sort')),
  );
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => setPageIndex(0), [query, data]);

  const filtered = useMemo(
    () =>
      filterRows(
        rows,
        query,
        columns.map((c) => c.id),
      ),
    [rows, query, columns],
  );
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const visible = sorted.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize,
  );
  const colorRanges = useMemo(() => {
    const out: Record<string, { min: number; max: number }> = {};
    columns.forEach((c) => {
      if (c.contentType !== 'colorscale') return;
      const values = rows
        .map((r) => toNumber(r[c.id]))
        .filter((v): v is number => v !== null);
      if (!values.length) return;
      out[c.id] = {
        min: values.reduce((a, b) => (b < a ? b : a)),
        max: c.colorMax ?? values.reduce((a, b) => (b > a ? b : a)),
      };
    });
    return out;
  }, [columns, rows]);

  const title = propString(props, 'title');
  const compact = propBool(props, 'compact');
  const shading = propBool(props, 'rowShading');
  const rowNumbers = propBool(props, 'rowNumbers');
  const wrapTitles = propBool(props, 'wrapTitles');
  const emptyMessage = propString(props, 'emptyMessage') ?? 'No rows';

  const toggleSort = (column: string) => {
    if (!sortable) return;
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  };

  const cell = (row: Row, column: ColumnConfig) => {
    const value = row[column.id];
    const n = toNumber(value);
    const align = column.align ?? defaultAlign(rows, column.id);
    let content: React.ReactNode = formatCell(value, column, tableFmt);
    let color: string | undefined;
    if (column.contentType === 'delta' && n !== null) {
      color = deltaColor(n, Boolean(column.downIsGood));
      content = `${deltaSymbol(n)} ${formatCell(Math.abs(n), column, tableFmt)}`;
    } else if (column.redNegatives && n !== null && n < 0) {
      color = '#c62828';
    }
    return (
      <TableCell
        key={column.id}
        align={align}
        sx={{
          color,
          whiteSpace: column.wrap ? 'normal' : 'nowrap',
          bgcolor:
            column.contentType === 'colorscale'
              ? colorScale(
                  value,
                  colorRanges[column.id]?.max ?? 0,
                  colorRanges[column.id]?.min ?? 0,
                )
              : undefined,
        }}
      >
        {content}
      </TableCell>
    );
  };

  return (
    <Panel testId="bi-datatable" sx={{ p: 0, overflow: 'hidden' }}>
      {(title || searchable) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 2,
            pt: 1.5,
            pb: 1,
            gap: 2,
          }}
        >
          {title && (
            <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
              {title}
            </Typography>
          )}
          {searchable && (
            <TextField
              size="small"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ ml: 'auto', width: 220 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ fontSize: 16 }} />
                  </InputAdornment>
                ),
                inputProps: { 'aria-label': 'Search table' },
              }}
            />
          )}
        </Box>
      )}
      <TableContainer>
        <Table
          size={compact ? 'small' : 'medium'}
          sx={{
            '& td, & th': { py: compact ? 0.25 : 0.75, fontSize: '0.8rem' },
          }}
        >
          <TableHead>
            <TableRow>
              {rowNumbers && <TableCell sx={{ width: 40 }} />}
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align ?? defaultAlign(rows, column.id)}
                  sx={{
                    fontWeight: 600,
                    whiteSpace: wrapTitles ? 'normal' : 'nowrap',
                  }}
                >
                  {sortable ? (
                    <TableSortLabel
                      active={sort?.column === column.id}
                      direction={
                        sort?.column === column.id ? sort.direction : 'asc'
                      }
                      onClick={() => toggleSort(column.id)}
                    >
                      {column.title}
                    </TableSortLabel>
                  ) : (
                    column.title
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (rowNumbers ? 1 : 0)}
                  align="center"
                >
                  <Typography variant="caption" color="text.secondary">
                    {emptyMessage}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {visible.map((row, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <TableRow
                key={i}
                sx={{ bgcolor: shading && i % 2 ? 'action.hover' : undefined }}
              >
                {rowNumbers && (
                  <TableCell sx={{ color: 'text.secondary' }}>
                    {pageIndex * pageSize + i + 1}
                  </TableCell>
                )}
                {columns.map((column) => cell(row, column))}
              </TableRow>
            ))}
          </TableBody>
          {propBool(props, 'totalRow') && (
            <TableFooter>
              <TableRow>
                {rowNumbers && <TableCell />}
                {columns.map((column, i) => {
                  const total = totalFor(filtered, column);
                  let text: string;
                  if (total.isText) text = String(total.value ?? '');
                  else
                    text = formatCell(
                      total.value,
                      { ...column, fmt: column.totalFmt ?? column.fmt },
                      tableFmt,
                    );
                  if (i === 0 && !text) text = 'Total';
                  return (
                    <TableCell
                      key={column.id}
                      align={column.align ?? defaultAlign(rows, column.id)}
                      sx={{ fontWeight: 600, color: 'text.primary' }}
                    >
                      {text}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>
      {sorted.length > pageSize && (
        <TablePagination
          component="div"
          count={sorted.length}
          page={pageIndex}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[pageSize]}
          onPageChange={(_, p) => setPageIndex(p)}
        />
      )}
    </Panel>
  );
};
