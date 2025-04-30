import { CSSProperties, ReactElement, ReactNode } from 'react';

export type orderingType = 'asc' | 'desc';

export type ColumnType<T> = {
  id: keyof T;
  label: string;
  render?: (row: T) => ReactNode;
};

export type CustomTablePagination<T> = {
  page: number;
  setPage: (page: number) => void;
  perPage: number;
  setPerPage: (perPage: number) => void;
  count: number;
  order?: orderingType;
  setOrder: (order: orderingType) => void;
  orderBy?: keyof T;
  setOrderBy: (orderBy: keyof T) => void;
  keyword: string;
  setKeyword: (keyword: string) => void;
};

export type TableRowAction<T> = {
  Component: (row: T) => ReactElement;
};

export type CustomTableType<T> = {
  id: string;
  name: string;
  rows: Array<T>;
  columns: Array<ColumnType<T>>;
  indexCell?: boolean;
  classes?: Object;
  loading?: boolean;
  customPagination?: CustomTablePagination<T>;
  rowActions?: Array<TableRowAction<T>>;
  containerStyle?: CSSProperties;
};
