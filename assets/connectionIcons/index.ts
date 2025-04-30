import snowflake from './snowflake.png';
import bigquery from './bigquery.png';
import postgres from './postgresql.png';
import redshift from './redshift.png';
import databricks from './databricks.png'; // Import databricks icon
import { SupportedConnectionTypes } from '../../src/types/backend';

type Image = Record<SupportedConnectionTypes, string>;

const obj: { images: Image } = {
  images: {
    snowflake,
    bigquery,
    postgres,
    redshift,
    databricks,
  },
};

export default obj;
