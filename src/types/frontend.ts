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
  | `db-token-${string}`;

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
  secretAccessKey: string;
}

export interface AzureConfig {
  accountName: string;
  accountKey: string;
  connectionString?: string;
}

export interface GCSConfig {
  projectId: string;
  credentials?: any;
}

export type CloudStorageConfig = S3Config | AzureConfig | GCSConfig;

export type CloudProvider = 'aws' | 'azure' | 'gcs';

export interface CloudConnection {
  id: string;
  name: string;
  provider: CloudProvider;
  config: CloudStorageConfig;
  created: Date;
  lastUsed?: Date;
}

export interface RecentItem {
  id: string;
  name: string;
  path: string;
  connectionId: string;
  connectionName: string;
  provider: CloudProvider;
  accessedAt: Date;
}
