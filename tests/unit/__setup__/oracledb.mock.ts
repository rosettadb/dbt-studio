export const resultSet = {
  getRows: jest.fn().mockResolvedValue([]),
  close: jest.fn().mockResolvedValue(undefined),
};

export const connection = {
  thin: true,
  oracleServerVersionString: '23.0.0.0.0',
  callTimeout: 0,
  execute: jest.fn().mockResolvedValue({ rows: [], metaData: [] }),
  close: jest.fn().mockResolvedValue(undefined),
  break: jest.fn().mockResolvedValue(undefined),
};

const oracledb = {
  thin: true,
  getConnection: jest.fn().mockResolvedValue(connection),
  OUT_FORMAT_OBJECT: 4002,
  OUT_FORMAT_ARRAY: 4001,
  DB_TYPE_VARCHAR: 2001,
  DB_TYPE_NUMBER: 2010,
  DB_TYPE_BINARY_FLOAT: 2007,
  DB_TYPE_BINARY_DOUBLE: 2008,
  DB_TYPE_DATE: 2011,
  DB_TYPE_TIMESTAMP: 2012,
  DB_TYPE_TIMESTAMP_TZ: 2013,
  DB_TYPE_TIMESTAMP_LTZ: 2014,
  DB_TYPE_INTERVAL_DS: 2015,
  DB_TYPE_INTERVAL_YM: 2016,
  DB_TYPE_RAW: 2006,
  DB_TYPE_ROWID: 2005,
  DB_TYPE_UROWID: 2030,
  DB_TYPE_CLOB: 2017,
  DB_TYPE_NCLOB: 2018,
  DB_TYPE_LONG: 2024,
  DB_TYPE_BLOB: 2019,
  DB_TYPE_BFILE: 2020,
  DB_TYPE_LONG_RAW: 2025,
  DB_TYPE_JSON: 2027,
  DB_TYPE_BOOLEAN: 2022,
  DB_TYPE_VECTOR: 2033,
  DB_TYPE_OBJECT: 2023,
};

export default oracledb;
