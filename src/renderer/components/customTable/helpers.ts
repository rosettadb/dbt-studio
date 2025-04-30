export const comparator = <T>(a: T, b: T, orderBy: keyof T) => {
  if (b[orderBy] < a[orderBy]) {
    return -1;
  }
  if (b[orderBy] > a[orderBy]) {
    return 1;
  }
  return 0;
};

export const getComparator = <T>(order: 'asc' | 'desc', orderBy: keyof T) => {
  return (a: T, b: T) =>
    comparator(a, b, orderBy) * (order === 'desc' ? 1 : -1);
};

export const stableSort = <T>(
  rows: Array<T>,
  order: 'asc' | 'desc',
  orderBy?: keyof T,
) => {
  if (orderBy === undefined) {
    return rows;
  }
  const stabilizedThis = rows.map((row, index: number) => ({
    row,
    index,
  }));
  stabilizedThis.sort((a, b) => {
    const cmp = getComparator<T>(order, orderBy)(a.row, b.row);
    if (cmp !== 0) {
      return cmp;
    }
    return a.index - b.index;
  });
  return stabilizedThis.map((stabilized) => stabilized.row);
};
