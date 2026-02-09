import * as crypto from 'crypto';
import type {
  CloudStorageConfig,
  CloudProvider,
  S3Config,
  AzureConfig,
  GCSConfig,
  MinIOConfig,
  CloudflareR2Config,
} from '../../types/frontend';

/**
 * Cloud Authentication Helper
 * Contains methods for building cloud authentication secrets and token generation
 */

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
  `;

  switch (provider) {
    case 'aws': {
      const awsConfig = config as S3Config;
      return `
        ${dropSecretsQuery}
        CREATE OR REPLACE SECRET s3_secret (
          TYPE s3,
          PROVIDER config,
          KEY_ID '${awsConfig.accessKeyId}',
          SECRET '${awsConfig.secretAccessKey}',
          REGION '${awsConfig.region}'
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

      // eslint-disable-next-line no-console
      console.log('[DuckDB MinIO Secret] Building secret with:', {
        originalEndpoint: minioConfig.endpoint,
        cleanEndpoint,
        useSSL: minioConfig.useSSL,
        region: minioConfig.region || 'us-east-1',
      });

      return `
        ${dropSecretsQuery}
        CREATE OR REPLACE SECRET minio_secret (
          TYPE s3,
          PROVIDER config,
          KEY_ID '${minioConfig.accessKeyId}',
          SECRET '${minioConfig.secretAccessKey}',
          REGION '${minioConfig.region || 'us-east-1'}',
          ENDPOINT '${cleanEndpoint}',
          USE_SSL ${minioConfig.useSSL ? 'true' : 'false'},
          URL_STYLE 'path'
        );
      `;
    }
    case 'cloudflare-r2': {
      const r2Config = config as CloudflareR2Config;

      // eslint-disable-next-line no-console
      console.log('[DuckDB R2 Secret] Building secret with:', {
        accountId: r2Config.accountId,
        jurisdiction: r2Config.jurisdiction,
        accessKeyId: r2Config.accessKeyId,
      });

      return `
        ${dropSecretsQuery}
        CREATE OR REPLACE SECRET r2_secret (
          TYPE R2,
          KEY_ID '${r2Config.accessKeyId}',
          SECRET '${r2Config.secretAccessKey}',
          ACCOUNT_ID '${r2Config.accountId}'
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
              EXTRA_HTTP_HEADERS MAP {'Authorization': 'Bearer ${token}'}
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
        // Build proper Azure connection string format
        const connectionString = `DefaultEndpointsProtocol=https;AccountName=${azureConfig.accountName};AccountKey=${azureConfig.accountKey};EndpointSuffix=core.windows.net`;

        return `
          ${dropSecretsQuery}
          CREATE OR REPLACE SECRET azure_secret (
            TYPE azure,
            CONNECTION_STRING '${connectionString}'
          );
        `;
      }

      if (azureConfig.connectionString) {
        // Use provided connection string
        return `
          ${dropSecretsQuery}
          CREATE OR REPLACE SECRET azure_secret (
            TYPE azure,
            CONNECTION_STRING '${azureConfig.connectionString}'
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
            ACCOUNT_NAME '${azureConfig.accountName}'
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
    case 'gcs':
      // Use HTTPS URL for GCS since native gcs:// might not be supported
      return `https://storage.googleapis.com/${bucketName}/${objectName}`;
    case 'azure':
      return `az://${bucketName}/${objectName}`;
    default:
      throw new Error(`Unsupported cloud provider: ${provider}`);
  }
}
