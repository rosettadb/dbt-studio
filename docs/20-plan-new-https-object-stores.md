# Plan: HTTPS Object Stores Integration (MinIO, Cloudflare R2, Backblaze B2, rustfs)

Do not generate .md ai context docs on your own, you are LLm, only me (human) can genreate .md ai context files. You can only update existing ones.

## Parent Document

- **[ai-context/github-intructions.md](./ai-context/github-intructions.md)** - Main AI Context (Root)

## Related Documents

- **[Cloud Explorer Feature](./ai-context/02-features/cloud-explorer-feature.md)** - Existing cloud storage architecture
- **[Object Stores AI Context](./object-stores-ai-context.md)** - Provider-specific documentation and examples
- **[DuckDB HTTPS Object Stores Context](./duckdb-https-object-stores-ai-context.md)** - DuckDB httpfs extension documentation

## Overview

This plan outlines the integration of four additional HTTPS-based object storage providers into DBT Studio's Cloud Explorer feature: MinIO, Cloudflare R2, Backblaze B2, and rustfs. These providers will extend the existing cloud storage capabilities (AWS S3, Azure Blob, GCS) with S3-compatible and HTTPS-based storage solutions.

**Implementation Status**: This is a phased implementation plan. Each phase builds upon the previous one, with detailed implementation steps provided below.

## Motivation

- **Self-hosted storage**: MinIO and rustfs enable on-premises and self-hosted object storage
- **Cost optimization**: Cloudflare R2 offers zero egress fees, Backblaze B2 provides competitive pricing
- **S3 compatibility**: All four providers support S3-compatible APIs, simplifying integration
- **Developer flexibility**: Support for local development (MinIO) and edge storage (Cloudflare R2)
- **DuckDB native support**: All providers work with DuckDB's httpfs extension for data preview

## Provider Documentation References

- **Cloudflare R2**: [S3 API Compatibility](https://developers.cloudflare.com/r2/get-started/s3/) - Full S3-compatible API with `region: 'auto'`
- **Backblaze B2**: [S3-Compatible API](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api) - S3 v4 signatures, multipart upload support
- **rustfs**: [JavaScript SDK Guide](https://docs.rustfs.com/developer/sdk/javascript.html) - S3-compatible with `forcePathStyle: true`
- **DuckDB httpfs**: [S3 API Support](https://duckdb.org/docs/extensions/httpfs.html) - Native S3 secret management and httpfs extension

## Architecture Integration

### Provider Characteristics

| Provider | Protocol | Authentication | DuckDB Support | Icon | Use Case |
|----------|----------|----------------|----------------|------|----------|
| **MinIO** | S3-compatible | Access Key/Secret | httpfs + S3 secret | `minio.png` | Self-hosted, local dev |
| **Cloudflare R2** | S3-compatible | Access Key/Secret | httpfs + R2 secret | `cloudflare_r2.png` | Edge storage, zero egress |
| **Backblaze B2** | S3-compatible | Application Key/ID | httpfs + S3 secret | `blackbaze.png` | Cost-effective backup |
| **rustfs** | S3-compatible | Access Key/Secret | httpfs + S3 secret | `rustfs.png` | Lightweight self-hosted |

**Icon Location**: All provider icons are located in `dbt-studio/assets/connectionIcons/`

### Integration Points

Following the existing Cloud Explorer architecture:

1. **Service Layer** (`src/main/services/cloudExplorer.service.ts`)
   - Add provider-specific S3Client initialization
   - Implement S3-compatible operations for all four providers
   - Configure custom endpoints and path-style URLs

2. **Preview Service** (`src/main/services/cloudPreview.service.ts`)
   - Extend `buildCloudSecretQuery()` for new providers
   - Add endpoint configuration for S3-compatible services
   - Support DuckDB R2 secret type for Cloudflare R2

3. **DuckDB Integration** (`src/main/services/duckdb.service.ts`)
   - Configure S3-compatible endpoints (MinIO, R2, B2, rustfs)
   - Manage provider-specific secrets
   - Handle connection pooling for all providers

4. **Frontend Components** (`src/renderer/components/cloudExplorer/`)
   - Extend `ConnectionForm.tsx` with new provider options
   - Add provider-specific configuration fields
   - Update provider icons and branding

5. **Type Definitions** (`src/types/`)
   - Add provider types: `'minio' | 'cloudflare-r2' | 'backblaze-b2' | 'rustfs'`
   - Define provider-specific config interfaces
   - Extend `CloudStorageConfig` union type

## Implementation Phases

### Phase 1: MinIO Integration ✅ Ready to Implement

**Status**: Ready for implementation  
**Priority**: High (most commonly used self-hosted solution)  
**Complexity**: Low (S3-compatible, reuses existing AWS S3Client)  
**Icon**: `dbt-studio/assets/connectionIcons/minio.png`

**Key Features**:
- Self-hosted S3-compatible storage
- Local development support (default: `localhost:9000`)
- SSL/TLS optional configuration
- Path-style URL support (`forcePathStyle: true`)
- Full DuckDB integration via S3 secret with custom endpoint

**DuckDB Secret Configuration**:
```sql
CREATE OR REPLACE SECRET minio_secret (
  TYPE S3,
  KEY_ID 'minioadmin',
  SECRET 'minioadmin',
  REGION 'us-east-1',
  ENDPOINT 'localhost:9000',
  USE_SSL false,
  URL_STYLE 'path'
);
```

**Estimated Effort**: 2-3 days

---

### Phase 2: Cloudflare R2 Integration ⏳ Pending Phase 1

**Status**: Pending Phase 1 completion  
**Priority**: High (zero egress fees, edge storage)  
**Complexity**: Low (S3-compatible, DuckDB has native R2 secret type)  
**Icon**: `dbt-studio/assets/connectionIcons/cloudflare_r2.png`

**Key Features**:
- Zero egress fees
- Edge storage with global distribution
- EU jurisdiction support (`jurisdiction: 'eu'`)
- S3-compatible API with auto region
- Native DuckDB R2 secret support

**DuckDB Secret Configuration**:
```sql
CREATE OR REPLACE SECRET r2_secret (
  TYPE R2,
  KEY_ID 'your_access_key_id',
  SECRET 'your_secret_access_key',
  ACCOUNT_ID 'your_account_id'
);
```

**Estimated Effort**: 1-2 days (after Phase 1)

---

### Phase 3: Backblaze B2 Integration ⏳ Pending Phase 2

**Status**: Pending Phase 2 completion  
**Priority**: Medium (cost-effective backup solution)  
**Complexity**: Low (S3-compatible, similar to MinIO pattern)  
**Icon**: `dbt-studio/assets/connectionIcons/blackbaze.png`

**Key Features**:
- Cost-effective backup and archive
- S3-compatible API (v4 signatures only)
- Custom endpoint support (default: `s3.us-west-004.backblazeb2.com`)
- Multipart upload support
- Large file handling

**DuckDB Secret Configuration**:
```sql
CREATE OR REPLACE SECRET b2_secret (
  TYPE S3,
  KEY_ID 'your_application_key_id',
  SECRET 'your_application_key',
  REGION 'us-west-004',
  ENDPOINT 's3.us-west-004.backblazeb2.com',
  USE_SSL true
);
```

**Estimated Effort**: 1-2 days (after Phase 2)

---

### Phase 4: rustfs Integration ⏳ Pending Phase 3

**Status**: Pending Phase 3 completion  
**Priority**: Low (niche use case, but S3-compatible)  
**Complexity**: Low (S3-compatible with forcePathStyle, similar to MinIO)  
**Icon**: `dbt-studio/assets/connectionIcons/rustfs.png`

**Key Features**:
- Lightweight self-hosted storage
- S3-compatible API with path-style URLs
- Custom endpoint configuration
- Full S3 SDK compatibility
- DuckDB S3 secret support

**DuckDB Secret Configuration**:
```sql
CREATE OR REPLACE SECRET rustfs_secret (
  TYPE S3,
  KEY_ID 'rustfsadmin',
  SECRET 'rustfssecret',
  REGION 'us-east-1',
  ENDPOINT 'http://192.168.1.100:9000',
  USE_SSL false,
  URL_STYLE 'path'
);
```

**Note**: rustfs is fully S3-compatible (not HTTPS-only as initially thought). It uses the same pattern as MinIO with `forcePathStyle: true`.

**Estimated Effort**: 1-2 days (after Phase 3, simpler than initially estimated)

## Type Definitions

### Updated Provider Types

```typescript
// src/types/cloudExplorer.ts

export type CloudProvider = 
  | 'aws' 
  | 'azure' 
  | 'gcs' 
  | 'minio' 
  | 'cloudflare-r2' 
  | 'backblaze-b2' 
  | 'rustfs';

export interface MinIOConfig {
  endpoint: string;           // e.g., 'localhost:9000' or 'minio.example.com:9000'
  accessKeyId: string;
  secretAccessKey: string;
  useSSL?: boolean;           // default: false
  region?: string;            // default: 'us-east-1'
}

export interface CloudflareR2Config {
  accountId: string;          // 33-character hexadecimal account ID
  accessKeyId: string;        // R2 API token
  secretAccessKey: string;    // R2 API secret
  jurisdiction?: 'eu';        // Optional: 'eu' for EU-only data
}

export interface BackblazeB2Config {
  applicationKeyId: string;   // B2 application key ID
  applicationKey: string;     // B2 application key (secret)
  endpoint?: string;          // Optional: default 's3.us-west-004.backblazeb2.com'
}

export interface RustfsConfig {
  endpoint: string;           // e.g., 'http://192.168.1.100:9000'
  accessKeyId: string;        // rustfs access key (e.g., 'rustfsadmin')
  secretAccessKey: string;    // rustfs secret key
  useSSL?: boolean;           // default: false
  region?: string;            // default: 'us-east-1'
}

export type CloudStorageConfig = 
  | AWSS3Config 
  | AzureBlobConfig 
  | GCSConfig 
  | MinIOConfig 
  | CloudflareR2Config 
  | BackblazeB2Config 
  | RustfsConfig;
```

## DuckDB Extension Requirements

### Existing Extensions (Already Installed)

- **httpfs**: HTTP/HTTPS file access (required for all providers)
- **aws**: S3-compatible operations (used by all four providers)
- **json**: JSON file parsing
- **excel**: Excel file support
- **avro**: Avro file support

### DuckDB Secret Types

All four providers use DuckDB's secret management system:

1. **MinIO**: Uses `TYPE S3` with custom endpoint and `URL_STYLE 'path'`
2. **Cloudflare R2**: Uses `TYPE R2` (native DuckDB support) with `ACCOUNT_ID`
3. **Backblaze B2**: Uses `TYPE S3` with custom endpoint
4. **rustfs**: Uses `TYPE S3` with custom endpoint and `URL_STYLE 'path'`

### Configuration Notes

- **MinIO**: Requires `forcePathStyle: true` in S3Client and `URL_STYLE 'path'` in DuckDB secret
- **Cloudflare R2**: Uses `region: 'auto'` and account-specific endpoint (auto-generated from ACCOUNT_ID)
- **Backblaze B2**: Uses S3-compatible API with region `us-west-004` and custom endpoint
- **rustfs**: Fully S3-compatible, requires `forcePathStyle: true` (same as MinIO pattern)

## Security Considerations

### Credential Storage

- All credentials stored in Electron secure storage (keytar)
- Never expose credentials in frontend logs
- Use environment-specific credential isolation

### Connection Validation

- Test connection before saving credentials
- Validate endpoint URLs and formats
- Check SSL/TLS certificate validity
- Implement timeout protection (5 seconds)

### Data Privacy

- In-memory processing only (no persistent storage of data)
- Automatic cleanup of DuckDB connections
- Limited data sampling for previews (default 100 rows)

## Error Handling

### Provider-Specific Errors

- **MinIO**: Connection refused (check if server is running), invalid endpoint, SSL certificate errors, path-style URL issues
- **Cloudflare R2**: Invalid account ID (must be 33-character hex), invalid API token, jurisdiction mismatch, region 'auto' not supported
- **Backblaze B2**: Invalid application key ID/secret, endpoint not found, region mismatch, v2 signature errors (only v4 supported)
- **rustfs**: Connection refused (check if server is running), invalid credentials, endpoint URL format errors, path-style URL issues

### User-Friendly Messages

```typescript
const ERROR_MESSAGES = {
  'minio': {
    'ECONNREFUSED': 'Cannot connect to MinIO server. Ensure the server is running at the specified endpoint.',
    'InvalidAccessKeyId': 'Invalid MinIO access key. Check your credentials in MinIO console.',
    'SignatureDoesNotMatch': 'Invalid MinIO secret key. Verify your credentials.',
    'PermanentRedirect': 'Bucket region mismatch. Check your region configuration.',
  },
  'cloudflare-r2': {
    'InvalidAccessKeyId': 'Invalid R2 API token. Generate a new token in Cloudflare dashboard → R2 → Manage API Tokens.',
    'NoSuchBucket': 'Bucket not found. Verify bucket name and account ID.',
    'InvalidAccountId': 'Invalid account ID. Must be a 33-character hexadecimal string.',
    'AccessDenied': 'Insufficient permissions. Ensure API token has "Object Read & Write" permissions.',
  },
  'backblaze-b2': {
    'InvalidAccessKeyId': 'Invalid B2 application key ID. Check your credentials in Backblaze dashboard.',
    'SignatureDoesNotMatch': 'Invalid B2 application key. Verify your credentials.',
    'EndpointNotFound': 'Invalid B2 endpoint. Use default (s3.us-west-004.backblazeb2.com) or check your region.',
    'InvalidRequest': 'B2 only supports S3 v4 signatures. Ensure your SDK is configured correctly.',
  },
  'rustfs': {
    'ECONNREFUSED': 'Cannot connect to rustfs server. Ensure the server is running at the specified endpoint.',
    'InvalidAccessKeyId': 'Invalid rustfs access key. Check your credentials.',
    'SignatureDoesNotMatch': 'Invalid rustfs secret key. Verify your credentials.',
    'NetworkError': 'Network error connecting to rustfs. Check endpoint URL format (http:// or https://).',
  },
};
```

## UI/UX Enhancements

### Provider Icons

All provider icons are already available in `dbt-studio/assets/connectionIcons/`:

- **MinIO**: `minio.png` - Orange/red branding
- **Cloudflare R2**: `cloudflare_r2.png` - Orange branding
- **Backblaze B2**: `blackbaze.png` - Red branding (note: filename has typo, should be "backblaze")
- **rustfs**: `rustfs.png` - Custom storage icon

**Icon Integration**:
```typescript
// src/renderer/components/cloudExplorer/ConnectionForm.tsx
const PROVIDER_ICONS = {
  aws: awsIcon,
  azure: azureIcon,
  gcs: gcsIcon,
  minio: minioIcon,           // NEW
  'cloudflare-r2': r2Icon,    // NEW
  'backblaze-b2': backblazeIcon, // NEW
  rustfs: rustfsIcon,         // NEW
};
```

### Connection Form Improvements

- Provider-specific help text and tooltips
- Inline validation for endpoint URLs
- Test connection button with loading state
- Example configurations for each provider

### Dashboard Statistics

- Update statistics cards to include new providers
- Show provider distribution in connection list
- Add provider-specific metrics (if available)

## Testing Strategy

### Unit Tests

- Test provider client initialization
- Test credential validation
- Test URL formatting and endpoint construction
- Test error handling for each provider

### Integration Tests

- Test end-to-end connection flow
- Test bucket listing and object browsing
- Test data preview with DuckDB
- Test connection pooling and cleanup

### Manual Testing

- Test with real provider accounts
- Test with self-hosted MinIO instance
- Test with various file formats
- Test error scenarios and edge cases

## Documentation Updates

### User Documentation

- Add setup guides for each provider
- Document credential requirements
- Provide example configurations
- Add troubleshooting section

### Developer Documentation

- Update Cloud Explorer architecture docs
- Document provider-specific implementation details
- Add code examples for each provider
- Update IPC channel reference

## Migration Path

### Backward Compatibility

- Existing connections (AWS, Azure, GCS) remain unchanged
- No breaking changes to existing APIs
- Graceful handling of unknown provider types

### Version Compatibility

- Minimum DuckDB version: 0.9.0 (for S3-compatible support)
- Minimum Electron version: Current (no changes needed)
- Node.js version: Current (no changes needed)

## Success Criteria

### Phase 1: MinIO
- [ ] MinIO provider added to ConnectionForm dropdown
- [ ] Connection form shows MinIO-specific fields (endpoint, useSSL, accessKeyId, secretAccessKey, region)
- [ ] Test connection validates MinIO credentials
- [ ] List buckets works with MinIO endpoint
- [ ] Browse objects within MinIO buckets
- [ ] Preview Parquet/CSV files from MinIO using DuckDB S3 secret
- [ ] MinIO icon displays correctly in UI
- [ ] Error messages provide actionable guidance

### Phase 2: Cloudflare R2
- [ ] R2 provider added to ConnectionForm dropdown
- [ ] Connection form shows R2-specific fields (accountId, accessKeyId, secretAccessKey, jurisdiction)
- [ ] Test connection validates R2 credentials
- [ ] List buckets works with R2 endpoint (auto-generated from accountId)
- [ ] Browse objects within R2 buckets
- [ ] Preview data files from R2 using DuckDB R2 secret
- [ ] R2 icon displays correctly in UI
- [ ] EU jurisdiction configuration works correctly

### Phase 3: Backblaze B2
- [ ] B2 provider added to ConnectionForm dropdown
- [ ] Connection form shows B2-specific fields (applicationKeyId, applicationKey, endpoint)
- [ ] Test connection validates B2 credentials
- [ ] List buckets works with B2 endpoint
- [ ] Browse objects within B2 buckets
- [ ] Preview data files from B2 using DuckDB S3 secret
- [ ] B2 icon displays correctly in UI
- [ ] Custom endpoint configuration works

### Phase 4: rustfs
- [ ] rustfs provider added to ConnectionForm dropdown
- [ ] Connection form shows rustfs-specific fields (endpoint, accessKeyId, secretAccessKey, useSSL, region)
- [ ] Test connection validates rustfs credentials
- [ ] List buckets works with rustfs endpoint
- [ ] Browse objects within rustfs buckets
- [ ] Preview data files from rustfs using DuckDB S3 secret
- [ ] rustfs icon displays correctly in UI
- [ ] Path-style URL handling works correctly

### Overall
- [ ] All providers follow the 7-step Electron command flow
- [ ] IPC handlers remain thin (no business logic)
- [ ] Error handling in service layer with console.error + ESLint comment
- [ ] React Query hooks provide consistent state management
- [ ] DuckDB connection pooling works for all providers
- [ ] Security audit completed (credentials in secure storage)
- [ ] Documentation updated with setup guides for each provider
- [ ] Performance metrics meet existing standards

## Future Enhancements

### Phase 5: Advanced Features

- **Multi-region support**: Handle provider-specific regions
- **Bucket policies**: Display and manage bucket policies
- **Lifecycle rules**: Configure object lifecycle policies
- **Versioning**: Support object versioning where available
- **Encryption**: Support server-side encryption options
- **Metadata management**: Edit object metadata and tags

### Phase 6: Performance Optimizations

- **Parallel uploads**: Multi-part upload support
- **Caching**: Intelligent caching of bucket/object listings
- **Prefetching**: Predictive prefetching of likely-accessed objects
- **Compression**: Automatic compression for data transfer

## Notes

- This plan follows the existing Cloud Explorer architecture patterns
- All implementations follow the 7-step Electron command flow
- IPC handlers remain thin with business logic in services
- React Query hooks provide consistent state management
- DuckDB connection pooling ensures resource efficiency
- Security and credential management follow existing patterns
- All four providers are S3-compatible (rustfs is not HTTPS-only as initially thought)

Do not generate .md ai context docs on your own, you are LLm, only me (human) can genreate .md ai context files. You can only update existing ones.
