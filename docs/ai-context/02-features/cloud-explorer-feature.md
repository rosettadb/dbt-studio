# Cloud Explorer Feature - Context Documentation

## Overview

The Cloud Explorer is a comprehensive feature in the DBT Studio Electron app that enables users to connect to, browse, and preview data from various cloud storage providers (AWS S3, Azure Blob Storage, Google Cloud Storage). It integrates DuckDB for in-memory data previewing capabilities.

## Architecture Overview

### Core Components Structure

```
src/renderer/screens/cloudExplorer/index.tsx - Main routing component
src/renderer/components/cloudExplorer/
├── ExplorerSidebar.tsx          - Navigation sidebar
├── ExplorerDashboard.tsx        - Main dashboard with stats
├── ExplorerConnections.tsx      - Connection management
├── ExplorerBuckets.tsx          - Bucket listing
├── ExplorerBucketContent.tsx    - File/folder browser
├── ExplorerRecentItems.tsx      - Recent activity
├── ExplorerNewConnection.tsx    - Add connection form
├── ExplorerEditConnection.tsx   - Edit connection form
├── DataPreviewModal.tsx         - Modal for data preview
└── InlineDataPreview.tsx        - Inline preview component
```

### Service Layer

```
src/main/services/
├── cloudExplorer.service.ts     - Cloud storage operations
└── cloudPreview.service.ts      - DuckDB data preview

src/renderer/services/
├── cloudExplorer.service.ts     - Frontend service client
└── connectionStorage.service.ts - Local storage management
```

## Supported Cloud Providers

### AWS S3

- **Configuration**: `{ region, accessKeyId, secretAccessKey }`
- **DuckDB Support**: Full native support via httpfs extension
- **Operations**: List buckets, list objects, generate signed URLs, test connection

### Azure Blob Storage

- **Configuration**: `{ accountName, accountKey, connectionString? }`
- **DuckDB Support**: Full native support via azure extension
- **Operations**: List containers, list blobs, generate SAS URLs, test connection

### Google Cloud Storage

- **Configuration**: `{ projectId, credentials? }`
- **DuckDB Support**: HTTPS access for public files and signed URLs
- **Operations**: List buckets, list objects, generate signed URLs, test connection

## Data Preview Capabilities

### Supported File Types

- **Structured**: parquet, csv, json, jsonl, xlsx, xls, avro
- **Databases**: sqlite, db
- **Big Data**: arrow, delta, iceberg

### Preview Types

1. **Sample**: Returns first N rows of data (default 100)
2. **Schema**: Returns column information and types
3. **Stats**: Returns statistical summary of the data

### DuckDB Integration

- Uses in-memory DuckDB instance for each preview operation
- Automatically installs required extensions (httpfs, azure, json, excel, avro)
- Handles cloud authentication via DuckDB secrets
- Converts DuckDB-specific types to JavaScript values

## Key Features

### Connection Management

- Secure credential storage using Electron's secure storage
- Connection testing before saving
- CRUD operations for cloud connections
- Last used timestamp tracking

### File Browser

- Hierarchical navigation with breadcrumbs
- Search functionality within directories
- File type detection with appropriate icons
- Pagination for large directories
- Recent items tracking

### Data Preview

- Inline preview for supported file types
- Modal and fullscreen preview options
- Column type detection
- Error handling with provider-specific messages

### Recent Items

- Tracks recently accessed files and directories
- Separate filtering for files vs directories
- Quick navigation to recent locations

## Route Structure

```
/app/cloud-explorer/dashboard           - Main dashboard
/app/cloud-explorer/connections         - Connection management
/app/cloud-explorer/recent-items        - Recent activity
/app/cloud-explorer/new-connection      - Add connection
/app/cloud-explorer/edit-connection/:id - Edit connection
/app/cloud-explorer/buckets/:connectionId - Bucket listing
/app/cloud-explorer/bucket/:connectionId/:bucketName - File browser
```

## State Management

### React Query Integration

- Caching for bucket lists, object lists, connection data
- Mutation handling for CRUD operations
- Optimistic updates for better UX
- Error handling and retry logic

### Local Storage

- Connection persistence in localStorage
- Recent items tracking (max 50 items)
- Search preferences and UI state

## Error Handling

### Provider-Specific Errors

- AWS: S3 access denied, invalid credentials, region mismatch
- Azure: Storage account errors, SAS token issues
- GCS: Project access, authentication failures

### DuckDB Errors

- Extension installation failures
- Memory limitations
- File format incompatibilities
- Cloud access permission issues

## Security Considerations

### Credential Management

- Uses Electron's secure storage for sensitive data
- Credentials never logged or exposed in frontend
- Temporary signed URLs for file access
- Connection testing without storing credentials

### Data Privacy

- In-memory processing only (no persistent storage)
- Automatic cleanup of DuckDB instances
- Limited data sampling for previews

## Performance Optimizations

### Lazy Loading

- Buckets loaded only when needed
- Paginated object listing (100 items per page)
- Debounced search functionality

### Caching Strategy

- React Query caching for API responses
- Invalidation on mutations
- Stale-while-revalidate pattern

### Memory Management

- DuckDB instances cleaned up after use
- Limited preview data size
- Automatic garbage collection

## UI/UX Features

### Modern Interface

- Material-UI components with custom theming
- Responsive grid layouts
- Hover effects and transitions
- Loading states and skeleton screens

### Navigation

- Sidebar navigation with active state indicators
- Breadcrumb navigation in file browser
- Back/forward button support
- Keyboard shortcuts support

### Data Visualization

- Table view for structured data
- File type icons
- File size formatting
- Relative time display ("2 hours ago")

## Development Patterns

### TypeScript Usage

- Strict typing for all cloud provider configs
- Interface definitions for all data structures
- Generic types for provider-agnostic operations

### Error Boundaries

- Component-level error handling
- Graceful degradation on failures
- User-friendly error messages

### Testing Considerations

- Mockable service layer
- Provider-specific test configurations
- Edge case handling for large files

## Integration Points

### Main Process IPC

- Secure communication for cloud operations
- File system access for temporary files
- System notifications for long operations

### External Dependencies

- @duckdb/node-api for data processing
- Cloud provider SDKs (AWS, Azure, GCS)
- React Query for state management
- Material-UI for components

This documentation provides the essential context for understanding and working with the Cloud Explorer feature, focusing on architecture, capabilities, and implementation patterns rather than detailed code examples.
