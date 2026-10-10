/* eslint-disable no-console */
// TEMPORARY debug logging for dbt Charts. Remove this file and every line
// tagged `DBT-CHARTS-DEBUG` once debugging is finished:
//   grep -rn "DBT-CHARTS-DEBUG\|dbtChartsDebug" src
export const dlog = (layer: string, message: string, data?: unknown) => {
  const prefix = `[dbt-charts:debug][${layer}] ${new Date().toISOString()} ${message}`;
  if (data === undefined) console.log(prefix);
  else console.log(prefix, data);
};
