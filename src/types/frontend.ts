import { ReactNode } from 'react';
import type * as Monaco from 'monaco-editor';
import { Project, QueryResponseType, Table } from './backend';

export type AppContextType = {
  projects: Project[];
  selectedProject: Project;
  sidebarContent: ReactNode;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  setSidebarContent: (sideBarContent: ReactNode) => void;
  schema?: Table[];
  fetchSchema: () => Promise<void>;
  isLoadingSchema?: boolean;
  isAiProviderSet: boolean;
  setIsAiProviderSet: (isSet: boolean) => void;
};

export type ItemProps = {
  label: string;
  typeName?: string;
  primaryKey?: boolean;
  foreignKey?: boolean;
  icon?: string;
};

export type QueryHistoryType = {
  id: string;
  query: string;
  executedAt: Date;
  results?: QueryResponseType;
  projectId: string;
  projectName: string;
};

export type CompletionItem = Monaco.languages.CompletionItem;

export type SecureStorageAccount =
  | 'openai-api-key'
  | `db-user-${string}`
  | `db-password-${string}`
  | `db-token-${string}`
  | `cloud-gcs-${string}`
  | `cloud-aws-${string}`
  | `cloud-azure-${string}`;

// Cloud Explorer Types
export interface Bucket {
  name: string;
  created?: Date;
  location?: string;
}

export interface StorageObject {
  name: string;
  size: number;
  updated: Date;
  contentType?: string;
  isDirectory: boolean;
}

export interface CloudListResult {
  objects: StorageObject[];
  nextPageToken?: string;
}

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey?: string;
}

export interface AzureConfig {
  accountName: string;
  accountKey?: string;
  connectionString?: string;
}

export interface GCSConfig {
  projectId: string;
  credentials?: any;
}

export type CloudStorageConfig = S3Config | AzureConfig | GCSConfig;

export type CloudProvider = 'aws' | 'azure' | 'gcs';

export type CloudConnection = {
  id: string;
  name: string;
  provider: CloudProvider;
  config: CloudStorageConfig;
  created: Date;
  lastUsed?: Date;
};

export type RecentItem = {
  id: string;
  name: string;
  path: string;
  connectionId: string;
  connectionName: string;
  provider: CloudProvider;
  accessedAt: Date;
};

// Cloud Preview Types
export type PreviewResult = {
  success: boolean;
  data?: any[];
  columns?: Array<{ name: string; type: string }>;
  totalRows?: number;
  error?: string;
  objectPath: string;
  previewType: 'sample' | 'schema' | 'stats';
};

export type PreviewOptions = {
  provider: CloudProvider;
  cloudConfig: CloudStorageConfig;
  objectPath: string;
  previewType?: 'sample' | 'schema' | 'stats';
  limit?: number;
};

export type DatabaseSources = {
  cloudConnections: CloudConnection[];
  recentItems: RecentItem[];
};
