import * as crypto from 'crypto';
import type {
  CloudStorageConfig,
  CloudProvider,
  S3Config,
  AzureConfig,
  GCSConfig,
  MinIOConfig,
  CloudflareR2Config,
  BackblazeB2Config,
  RustfsConfig,
  GarageConfig,
} from '../../types/frontend';

/**
 * Cloud Authentication Helper
 * Contains methods for building cloud authentication secrets and token generation
 */

/**
 * Escape single quotes in SQL strings to prevent SQL injection
 * Replaces ' with '' (SQL standard for escaping single quotes)
 */
function escapeSqlString(value: string | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    return String(value);
  }
  return value.replace(/'/g, "''");
}

/**
 * Generate GCS Bearer token from service account credentials
 */
export async function generateGCSBearerToken(
  credentials: string,
  scope: string = 'https://www.googleapis.com/auth/devstorage.read_write',
): Promise<string> {
  try {
    // Parse the service account credentials
    const serviceAccount = JSON.parse(credentials);

    // Create JWT header
    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: serviceAccount.private_key_id,
    };

    // Create JWT payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccount.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, // Token expires in 1 hour
      iat: now,
    };

    // Encode header and payload
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url',
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );

    // Create signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(signatureInput)
      .sign(serviceAccount.private_key, 'base64url');

    // Create JWT
    const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(
        `Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`,
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error('No access token received from Google OAuth2');
    }

    return tokenData.access_token;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error generating GCS Bearer token:', error);
    throw error;
  }
}

/**
 * Build cloud authentication secret query based on provider
 */
export async function buildCloudSecretQuery(
  provider: CloudProvider,
  config: CloudStorageConfig,
): Promise<string> {
  // Drop all existing secrets to prevent conflicts between providers
  const dropSecretsQuery = `
    DROP SECRET IF EXISTS s3_secret;
    DROP SECRET IF EXISTS gcs_secret;
    DROP SECRET IF EXISTS azure_secret;
    DROP SECRET IF EXISTS minio_secret;
    DROP SECRET IF EXISTS r2_secret;
    DROP SECRET IF EXISTS b2_secret;
    DROP SECRET IF EXISTS rustfs_secret;
    DROP SECRET IF EXISTS garage_secret;
  `;

  switch (provider) {
    case 'aws': {
      const awsConfig = config as S3Config;
      let sessionTokenClause = '';
      if (awsConfig.sessionToken) {
        // Escape single quotes in session token to prevent SQL injection
        const escapedSessionToken = awsConfig.sessionToken.replace(/'/g, "''");
        sessionTokenClause = `,\n          SESSION_TOKEN '${escapedSessionToken}'`;
      }
      return `
        ${dropSecretsQuery}
        CREATE OR REPLACE SECRET s3_secret (
          TYPE s3,
          PROVIDER config,
          KEY_ID '${awsConfig.accessKeyId}',
          SECRET '${awsConfig.secretAccessKey}',
          REGION '${awsConfig.region}'${sessionTokenClause}
        );
      `;
    }
    case 'minio': {
      const minioConfig = config as MinIOConfig;

      // Strip protocol and trailing slashes from endpoint (in case it wasn't cleaned before storage)
      const cleanEndpoint = minioConfig.endpoint
        .replace(/^https?:\/\//, '') // Remove http:// or https://
        .replace(/\/$/, ''); // Remove trailing slash

      // For DuckDB S3 secrets, the ENDPOINT should NOT include the protocol
      // DuckDB will add it based on USE_SSL setting

      return `
        ${dropSecretsQuery}
        CREATE OR REPLACE SECRET minio_secret (
          TYPE s3,
          PROVIDER config,
          KEY_ID '${escapeSqlString(minioConfig.accessKeyId)}',
          SECRET '${escapeSqlString(minioConfig.secretAccessKey)}',
          REGION '${escapeSqlString(minioConfig.region || 'us-east-1')}',
          ENDPOINT '${escapeSqlString(cleanEndpoint)}',
          USE_SSL ${minioConfig.useSSL ? 'true' : 'false'},
          URL_STYLE 'path'
        );
      `;
    }
    case 'cloudflare-r2': {
      const r2Config = config as CloudflareR2Config;

      return `
        ${dropSecretsQuery}
        CREATE OR REPLACE SECRET r2_secret (
          TYPE R2,
          KEY_ID '${escapeSqlString(r2Config.accessKeyId)}',
          SECRET '${escapeSqlString(r2Config.secretAccessKey)}',
          ACCOUNT_ID '${escapeSqlString(r2Config.accountId)}'
        );
      `;
    }
    case 'backblaze-b2': {
      const b2Config = config as BackblazeB2Config;
      const endpoint = b2Config.endpoint || 's3.us-west-004.backblazeb2.com';

      // Extract region from endpoint (e.g., 's3.us-west-004.backblazeb2.com' -> 'us-west-004')
      const regionMatch = endpoint.match(/s3\.([^.]+[-][^.]+[-]\d+)\./);
      const region = regionMatch ? regionMatch[1] : 'us-west-004';

      return `
        ${dropSecretsQuery}
        CREATE OR REPLACE SECRET b2_secret (
          TYPE s3,
          PROVIDER config,
          KEY_ID '${escapeSqlString(b2Config.applicationKeyId)}',
          SECRET '${escapeSqlString(b2Config.applicationKey)}',
          REGION '${escapeSqlString(region)}',
          ENDPOINT '${escapeSqlString(endpoint)}',
          USE_SSL true
        );
      `;
    }
    case 'rustfs': {
      const rustfsConfig = config as RustfsConfig;

      // Strip protocol and trailing slashes from endpoint
      const cleanEndpoint = rustfsConfig.endpoint
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');

      return `
        ${dropSecretsQuery}
        CREATE OR REPLACE SECRET rustfs_secret (
          TYPE s3,
          PROVIDER config,
          KEY_ID '${escapeSqlString(rustfsConfig.accessKeyId)}',
          SECRET '${escapeSqlString(rustfsConfig.secretAccessKey)}',
          REGION '${escapeSqlString(rustfsConfig.region || 'us-east-1')}',
          ENDPOINT '${escapeSqlString(cleanEndpoint)}',
          USE_SSL ${rustfsConfig.useSSL ? 'true' : 'false'},
          URL_STYLE 'path'
        );
      `;
    }
    case 'garage': {
      const garageConfig = config as GarageConfig;

      // Strip protocol and trailing slashes from endpoint
      const cleanEndpoint = garageConfig.endpoint
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');

      // Default to path-style for broader compatibility
      const urlStyle =
        garageConfig.urlStyle === 'virtual-host' ? 'vhost' : 'path';

      return `
        ${dropSecretsQuery}
        CREATE OR REPLACE SECRET garage_secret (
          TYPE s3,
          PROVIDER config,
          KEY_ID '${escapeSqlString(garageConfig.accessKeyId)}',
          SECRET '${escapeSqlString(garageConfig.secretAccessKey)}',
          REGION '${escapeSqlString(garageConfig.region || 'us-east-1')}',
          ENDPOINT '${escapeSqlString(cleanEndpoint)}',
          USE_SSL ${garageConfig.useSSL ? 'true' : 'false'},
          URL_STYLE '${urlStyle}'
        );
      `;
    }
    case 'gcs': {
      const gcsConfig = config as GCSConfig;

      // Check if we have service account credentials
      if (gcsConfig.credentials) {
        try {
          // Generate Bearer token from service account credentials
          const token = await generateGCSBearerToken(gcsConfig.credentials);

          // Set up HTTP authentication secret for GCS
          return `
            ${dropSecretsQuery}
            CREATE OR REPLACE SECRET gcs_secret (
              TYPE http,
              EXTRA_HTTP_HEADERS MAP {'Authorization': 'Bearer ${escapeSqlString(token)}'}
            );
          `;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to generate GCS Bearer token:', error);
          // Fall back to no authentication (will only work for public files)
          return `${dropSecretsQuery}SELECT 'GCS HTTPS access enabled (public files only)' as message;`;
        }
      } else {
        // No credentials provided, only public files will work
        return `${dropSecretsQuery}SELECT 'GCS HTTPS access enabled (public files only)' as message;`;
      }
    }
    case 'azure': {
      const azureConfig = config as AzureConfig;

      // Check if we have account name and key to build connection string
      if (azureConfig.accountName && azureConfig.accountKey) {
        // Build proper Azure connection string format using raw values
        const connectionString = `DefaultEndpointsProtocol=https;AccountName=${azureConfig.accountName};AccountKey=${azureConfig.accountKey};EndpointSuffix=core.windows.net`;

        return `
          ${dropSecretsQuery}
          CREATE OR REPLACE SECRET azure_secret (
            TYPE azure,
            CONNECTION_STRING '${escapeSqlString(connectionString)}'
          );
        `;
      }

      if (azureConfig.connectionString) {
        // Use provided connection string
        return `
          ${dropSecretsQuery}
          CREATE OR REPLACE SECRET azure_secret (
            TYPE azure,
            CONNECTION_STRING '${escapeSqlString(azureConfig.connectionString)}'
          );
        `;
      }

      if (azureConfig.accountName) {
        // Use account name only (for anonymous access)
        return `
          ${dropSecretsQuery}
          CREATE OR REPLACE SECRET azure_secret (
            TYPE azure,
            PROVIDER config,
            ACCOUNT_NAME '${escapeSqlString(azureConfig.accountName)}'
          );
        `;
      }

      throw new Error(
        'Azure configuration must include either accountName+accountKey, connectionString, or accountName for anonymous access',
      );
    }
    default:
      throw new Error(`Unsupported cloud provider: ${provider}`);
  }
}

/**
 * Get the appropriate cloud storage URL format for the provider
 */
export function getCloudUrl(
  provider: CloudProvider,
  bucketName: string,
  objectName: string,
): string {
  switch (provider) {
    case 'aws':
      return `s3://${bucketName}/${objectName}`;
    case 'minio':
      return `s3://${bucketName}/${objectName}`;
    case 'cloudflare-r2':
      return `r2://${bucketName}/${objectName}`;
    case 'backblaze-b2':
      return `s3://${bucketName}/${objectName}`;
    case 'rustfs':
      return `s3://${bucketName}/${objectName}`;
    case 'garage':
      return `s3://${bucketName}/${objectName}`;
    case 'gcs':
      // Use HTTPS URL for GCS since native gcs:// might not be supported
      return `https://storage.googleapis.com/${bucketName}/${objectName}`;
    case 'azure':
      return `az://${bucketName}/${objectName}`;
    default:
      throw new Error(`Unsupported cloud provider: ${provider}`);
  }
}
