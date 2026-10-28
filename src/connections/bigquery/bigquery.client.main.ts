/* eslint-disable prefer-promise-reject-errors, consistent-return */
import { BigQuery } from '@google-cloud/bigquery';
import SecureStorageService from '../../main/services/secureStorage.service';
import {
  BigQueryConnection,
  BigQueryTestResponse,
  QueryResponseType,
} from '../../types/backend';

const BQ_NUMERIC_TYPES = new Set([
  'INTEGER',
  'INT64',
  'FLOAT',
  'FLOAT64',
  'NUMERIC',
  'BIGNUMERIC',
  'DECIMAL',
]);

export async function testBigQueryConnection(
  config: BigQueryConnection,
): Promise<BigQueryTestResponse> {
  if (config.method !== 'service-account' || !config.keyfile) {
    throw new Error('Only service account authentication is supported');
  }

  let keyfileValue = config.keyfile;
  if (
    typeof keyfileValue === 'string' &&
    keyfileValue.startsWith('db-bigquery-')
  ) {
    const stored = await SecureStorageService.getCredential(keyfileValue);
    if (!stored) {
      throw new Error(
        'BigQuery service account key not found in secure storage',
      );
    }
    keyfileValue = stored;
  }

  const bigqueryConfig: any = {
    projectId: config.project,
  };

  try {
    bigqueryConfig.credentials = JSON.parse(keyfileValue);
  } catch (err) {
    throw new Error('Invalid service account key JSON format');
  }

  if (config.location) {
    bigqueryConfig.location = config.location;
  }

  const client = new BigQuery(bigqueryConfig);

  try {
    await client.query('SELECT 1');
    return {
      success: true,
    };
  } catch (err: any) {
    if (err.code === 403) {
      throw new Error(
        'Permission denied. Please check your credentials and project access.',
      );
    } else if (err.code === 404) {
      throw new Error('Project not found. Please verify your Project ID.');
    } else if (err.code === 401) {
      throw new Error(
        'Authentication failed. Please check your service account key.',
      );
    }
    throw err;
  }
}

export const executeBigQueryQuery = async (
  config: BigQueryConnection,
  query: string,
): Promise<QueryResponseType> => {
  if (config.method !== 'service-account' || !config.keyfile) {
    return {
      success: false,
      error: 'Only service account authentication is supported',
    };
  }

  let keyfileValue = config.keyfile;
  if (
    typeof keyfileValue === 'string' &&
    keyfileValue.startsWith('db-bigquery-')
  ) {
    const stored = await SecureStorageService.getCredential(keyfileValue);
    if (!stored) {
      return {
        success: false,
        error: 'BigQuery service account key not found in secure storage',
      };
    }
    keyfileValue = stored;
  }

  const bigqueryConfig: any = {
    projectId: config.project,
  };

  try {
    bigqueryConfig.credentials = JSON.parse(keyfileValue);
  } catch (err) {
    return {
      success: false,
      error: 'Invalid service account key JSON format',
    };
  }

  if (config.location) {
    bigqueryConfig.location = config.location;
  }

  const client = new BigQuery(bigqueryConfig);

  try {
    const options: any = {
      query,
      location: config.location,
    };

    if (config.priority === 'batch') {
      options.priority = 'BATCH';
    }

    const [rows, , response] = await client.query(options);
    // Prefer the response schema: it survives an empty result set, where
    // deriving columns from rows[0] would leave the renderer with no fields
    // and make an empty SELECT look like a DDL command.
    const schemaFields: { name: string; type?: string }[] =
      (response as any)?.schema?.fields ?? [];

    let fields: { name: string; type: number }[] = [];
    if (schemaFields.length > 0) {
      fields = schemaFields.map((field) => ({
        name: field.name,
        type: BQ_NUMERIC_TYPES.has(String(field.type)) ? 1 : 0,
      }));
    } else if (rows.length > 0) {
      fields = Object.keys(rows[0]).map((name) => ({
        name,
        type: typeof rows[0][name] === 'number' ? 1 : 0,
      }));
    }

    return {
      success: true,
      data: rows,
      fields,
    };
  } catch (err: any) {
    let errorMessage = err.message;

    if (err.code === 403) {
      errorMessage =
        'Permission denied. Please check your credentials and project access.';
    } else if (err.code === 404) {
      errorMessage =
        'Project or dataset not found. Please verify your Project ID and dataset.';
    } else if (err.code === 401) {
      errorMessage =
        'Authentication failed. Please check your service account key.';
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};
