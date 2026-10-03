/**
 * DataFrame Table Output
 * Colab-style interactive table for a pandas DataFrame shown by a cell. The
 * kernel bridge's formatter sends the rows (DATAFRAME_MIME); paging, sorting
 * and filtering all run here, so they never call the kernel.
 */

import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  Box,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import {
  Code as CodeIcon,
  Search as SearchIcon,
  TableChart as TableChartIcon,
} from '@mui/icons-material';
import { CustomTablePagination } from '../../customTable/CustomTablePagination';
import useLocalStorage from '../../../hooks/useLocalStorage';
import type {
  DataFrameCellValue,
  DataFrameTableInfo,
} from '../../../../types/pythonNotebooks';

/** One shared key, so the chosen page size applies to every table. */
export const DATAFRAME_PER_PAGE_KEY = 'python-dataframe-table-per-page';
const NUMERIC_DTYPE = /^(?:u?int|float|Int|UInt|Float)\d*$/;

type SortKey = 'index' | number;
type SortDirection = 'asc' | 'desc';

interface Row {
  /** Position in the DataFrame; keeps sorting stable. */
  position: number;
  index: DataFrameCellValue;
  values: DataFrameCellValue[];
}

const numberFormat = new Intl.NumberFormat('en-US');
const collator = new Intl.Collator(undefined, { numeric: true });

function compareValues(
  a: Exclude<DataFrameCellValue, null>,
  b: Exclude<DataFrameCellValue, null>,
): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/** Missing values sort last in both directions. */
function sortRows(rows: Row[], key: SortKey, direction: SortDirection): Row[] {
  const pick = (row: Row) => (key === 'index' ? row.index : row.values[key]);
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = pick(left) ?? null;
    const b = pick(right) ?? null;
    if (a === null && b !== null) return 1;
    if (b === null && a !== null) return -1;
    const result = a !== null && b !== null ? compareValues(a, b) * sign : 0;
    return result || left.position - right.position;
  });
}

const headSx: SxProps<Theme> = {
  py: 0.5,
  px: 1,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  verticalAlign: 'bottom',
  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100'),
};

const cellSx = {
  py: 0.25,
  px: 1,
  fontSize: 12,
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

function renderValue(value: DataFrameCellValue) {
  if (value === null || value === undefined) {
    return (
      <Box
        component="span"
        sx={{ color: 'text.disabled', fontStyle: 'italic' }}
      >
        null
      </Box>
    );
  }
  return String(value);
}

interface DataFrameTableOutputProps {
  info: DataFrameTableInfo;
  /** pandas' own HTML for the same DataFrame, shown by the toggle button. */
  html?: React.ReactNode;
}

export const DataFrameTableOutput: React.FC<DataFrameTableOutputProps> = ({
  info,
  html,
}) => {
  const [showHtml, setShowHtml] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<{
    key: SortKey;
    direction: SortDirection;
  } | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useLocalStorage<number>(
    DATAFRAME_PER_PAGE_KEY,
    '10',
  );
  // Filtering 20k rows on every keystroke stays responsive this way.
  const filterText = useDeferredValue(keyword.trim().toLowerCase());

  const rows = useMemo<Row[]>(
    () =>
      (info.data ?? []).map((values, position) => ({
        position,
        index: info.index?.[position] ?? null,
        values,
      })),
    [info],
  );

  const filtered = useMemo(() => {
    if (!filterText) return rows;
    return rows.filter((row) =>
      [row.index, ...row.values].some(
        (value) =>
          value !== null &&
          value !== undefined &&
          String(value).toLowerCase().includes(filterText),
      ),
    );
  }, [rows, filterText]);

  const sorted = useMemo(
    () => (sort ? sortRows(filtered, sort.key, sort.direction) : filtered),
    [filtered, sort],
  );

  const numeric = useMemo(
    () => (info.dtypes ?? []).map((dtype) => NUMERIC_DTYPE.test(dtype)),
    [info.dtypes],
  );

  const lastPage = Math.max(0, Math.ceil(sorted.length / perPage) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageRows = sorted.slice(
    currentPage * perPage,
    (currentPage + 1) * perPage,
  );

  const toggleSort = (key: SortKey) => {
    setPage(0);
    setSort((previous) => {
      if (previous?.key !== key) return { key, direction: 'asc' };
      if (previous.direction === 'asc') return { key, direction: 'desc' };
      // Third click returns to the DataFrame's own order
      return null;
    });
  };

  const sortLabel = (key: SortKey, label: React.ReactNode) => (
    <TableSortLabel
      active={sort?.key === key}
      direction={sort?.key === key ? sort.direction : 'asc'}
      onClick={() => toggleSort(key)}
    >
      {label}
    </TableSortLabel>
  );

  const toggle = html ? (
    <Tooltip title={showHtml ? 'Show as interactive table' : 'Show as HTML'}>
      <IconButton
        size="small"
        onClick={() => setShowHtml((value) => !value)}
        aria-label={showHtml ? 'Show as interactive table' : 'Show as HTML'}
        data-testid="dataframe-table-toggle"
      >
        {showHtml ? (
          <TableChartIcon fontSize="small" />
        ) : (
          <CodeIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  ) : null;

  if (showHtml && html) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        {/* As in Colab: the table icon sits right next to the HTML table */}
        <Box sx={{ flex: '0 1 auto', minWidth: 0 }}>{html}</Box>
        {toggle}
      </Box>
    );
  }

  const truncated = info.rowCount < info.totalRows;

  return (
    <Box
      data-testid="dataframe-table"
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5 }}
      >
        <TextField
          size="small"
          placeholder="Filter rows…"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(0);
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              sx: { fontSize: '0.8125rem', height: '32px' },
            },
            htmlInput: { 'data-testid': 'dataframe-table-filter' },
          }}
          sx={{
            width: 240,
            '& .MuiInputBase-input': {
              paddingTop: '2px',
              paddingBottom: '2px',
            },
            '& .MuiOutlinedInput-root': { minHeight: '32px' },
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flex: 1, minWidth: 0 }}
          data-testid="dataframe-table-summary"
        >
          {`${numberFormat.format(info.totalRows)} rows × ${numberFormat.format(
            info.totalColumns,
          )} columns`}
          {truncated &&
            ` · showing the first ${numberFormat.format(info.rowCount)}`}
        </Typography>
        {toggle}
      </Box>
      <TableContainer sx={{ maxHeight: 440 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={headSx}>
                {sortLabel('index', info.indexName)}
              </TableCell>
              {info.columns.map((column, position) => (
                <TableCell
                  // Positions, not names: pandas allows duplicate column names
                  // eslint-disable-next-line react/no-array-index-key
                  key={position}
                  align={numeric[position] ? 'right' : 'left'}
                  sx={headSx}
                >
                  {sortLabel(position, column)}
                  <Typography
                    component="div"
                    sx={{
                      fontSize: 10,
                      fontWeight: 400,
                      color: 'text.secondary',
                    }}
                  >
                    {info.dtypes?.[position]}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow key={row.position} hover>
                <TableCell
                  sx={{ ...cellSx, fontWeight: 600, color: 'text.secondary' }}
                >
                  {renderValue(row.index)}
                </TableCell>
                {row.values.map((value, position) => (
                  <TableCell
                    // eslint-disable-next-line react/no-array-index-key
                    key={position}
                    align={numeric[position] ? 'right' : 'left'}
                    sx={cellSx}
                  >
                    {renderValue(value)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={info.columns.length + 1}
                  sx={{ ...cellSx, color: 'text.secondary' }}
                >
                  {filterText ? 'No matching rows' : 'Empty DataFrame'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {/* Compact footer: no extra toolbar height or padding */}
      <Box
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          '& .MuiTablePagination-toolbar': {
            minHeight: '30px !important',
            py: '0 !important',
          },
          '& .MuiTablePagination-actions .MuiIconButton-root': { p: 0.25 },
          '& .MuiTablePagination-select': { py: 0 },
        }}
      >
        <CustomTablePagination
          page={currentPage}
          setPage={setPage}
          perPage={perPage}
          setPerPage={(value) => {
            setPerPage(value);
            setPage(0);
          }}
          total={sorted.length}
        />
      </Box>
    </Box>
  );
};

export default DataFrameTableOutput;
