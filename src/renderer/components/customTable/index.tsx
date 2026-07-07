import React from 'react';
import { Table, TableBody, TableContainer } from '@mui/material';
import { CustomTableHead } from './CustomTableHead';
import { CustomTableRow } from './CustomTableRow';
import { CustomTableType } from './types';
import { CustomTableToolbar } from './CustomTableToolbar';
import { stableSort } from './helpers';
import { CustomTablePagination } from './CustomTablePagination';
import { useLocalStorage } from '../../hooks';
import { Loader } from '../loader';

const CustomTable = <T,>({
  id,
  name,
  rows,
  columns,
  indexCell,
  customPagination,
  loading,
  rowActions,
  containerStyle,
  toolbarContent,
  dataTestId,
  showSearch,
  hideToolbar,
  paginationLeftContent,
}: CustomTableType<T>) => {
  const [page, setPage] = React.useState(0);
  const [perPage, setPerPage] = useLocalStorage(id, '10');
  const [order, setOrder] = React.useState<'asc' | 'desc'>('asc');
  const [orderBy, setOrderBy] = React.useState<keyof T>();
  const [keyword, setKeyword] = React.useState('');

  const filteredRows = React.useMemo(() => {
    return rows.filter((row) => {
      if (keyword !== '') {
        setPage(0);
        return JSON.stringify(row).includes(keyword);
      }
      return true;
    });
  }, [keyword, rows]);

  const paginatedRows = React.useMemo(() => {
    const startIndex = page * Number(perPage);
    const endIndex = startIndex + Number(perPage);
    return filteredRows.slice(startIndex, endIndex);
  }, [page, perPage, filteredRows]);

  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      {loading && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
          }}
        >
          <Loader size={40} marginTop={0} />
        </div>
      )}
      {!hideToolbar && (
        <CustomTableToolbar
          name={name}
          toolbarContent={toolbarContent}
          handleSearch={(value) => {
            if (customPagination) {
              customPagination.setKeyword(value);
              return;
            }
            setKeyword(value);
          }}
          showSearch={showSearch}
        />
      )}
      <TableContainer
        style={{
          ...(containerStyle ?? {}),
          opacity: loading ? 0.4 : 1,
          pointerEvents: loading ? 'none' : 'auto',
          overflowX: 'auto',
          width: '100%',
        }}
      >
        <Table data-testid={dataTestId} stickyHeader size="small">
          <CustomTableHead
            onRequestSort={(property) => {
              if (customPagination) {
                customPagination.setOrderBy(property);
                return;
              }
              setPage(0);
              setOrderBy(property);
              setOrder(order === 'asc' ? 'desc' : 'asc');
            }}
            orderBy={customPagination?.orderBy ?? orderBy}
            order={customPagination?.order ?? order}
            columns={columns}
            indexCell={indexCell}
            rowActions={rowActions}
          />
          <TableBody>
            {(!customPagination
              ? stableSort(paginatedRows, order, orderBy)
              : rows
            ).map((row, index) => (
              <CustomTableRow<T>
                key={`table-row-${index}`}
                index={
                  (customPagination
                    ? customPagination.page * customPagination.perPage
                    : page * Number(perPage)) +
                  index +
                  1
                }
                row={row}
                columns={columns}
                indexCell={indexCell}
                rowActions={rowActions}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {paginationLeftContent && (
          <div style={{ paddingLeft: 8, paddingRight: 4, flexShrink: 0 }}>
            {paginationLeftContent}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <CustomTablePagination
            page={customPagination?.page ?? page}
            setPage={customPagination?.setPage ?? setPage}
            perPage={customPagination?.perPage ?? Number(perPage)}
            setPerPage={(value) => {
              if (customPagination?.setPerPage) {
                customPagination?.setPerPage(value);
                return;
              }
              setPerPage(String(value));
            }}
            total={customPagination?.count ?? rows.length}
          />
        </div>
      </div>
    </div>
  );
};

export { CustomTable };
