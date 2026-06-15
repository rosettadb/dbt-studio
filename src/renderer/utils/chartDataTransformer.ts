/**
 * Transforms raw SQL result data into a format suitable for Recharts visualization.
 *
 * @param data The raw array of objects from the SQL query
 * @param xAxisCol The column selected for the X-axis (category)
 * @param yAxisCol The column selected for the Y-axis (value)
 * @returns An array of objects formatted and type-coerced for Recharts
 */
export const transformSqlResultToChartData = (
  data: any[],
  xAxisCol: string,
  yAxisCol: string,
): any[] => {
  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data.map((row) => {
    // Clone the row to avoid mutating the original SQL result set
    const transformedRow = { ...row };

    // Recharts expects Y-axis values to be numbers for most charts.
    // SQL sometimes returns aggregates (like COUNT or SUM) as strings.
    // We attempt to parse the Y-axis value into a float so the chart scales correctly.
    if (
      yAxisCol &&
      transformedRow[yAxisCol] !== undefined &&
      transformedRow[yAxisCol] !== null
    ) {
      const rawValue = transformedRow[yAxisCol];

      // If it's a string that looks like a number, parse it
      if (typeof rawValue === 'string' && !Number.isNaN(Number(rawValue))) {
        transformedRow[yAxisCol] = parseFloat(rawValue);
      } else if (typeof rawValue === 'bigint') {
        transformedRow[yAxisCol] = Number(rawValue);
      }
    }

    // For X-axis, we usually want strings (categories), especially for dates
    // If it's a Date object, convert to ISO string or locale string for display
    if (xAxisCol && transformedRow[xAxisCol] instanceof Date) {
      transformedRow[xAxisCol] = transformedRow[xAxisCol].toLocaleDateString();
    }

    return transformedRow;
  });
};
