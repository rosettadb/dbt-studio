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
