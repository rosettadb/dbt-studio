# DBT Beekeeper SQL Studio - LLM Context Document

## Overview

The DBT Beekeeper SQL Studio is a modern SQL editor implementation within the DBT Studio Electron application, inspired by Beekeeper Studio's clean, intuitive design patterns. This implementation adapts Vue.js UX patterns to React/TypeScript while maintaining the existing DBT Studio architecture.

## Architecture

### Core Components

#### 1. **Main Container** (`src/renderer/screens/sqlBeeKeeper/index.tsx`)
- **Purpose**: Orchestrates the SQL editor components and manages global state
- **Key Features**:
  - Project and connection management
  - Query execution coordination
  - Query history management
  - Schema-based autocompletion generation
- **State Management**:
  - Uses `useQueryEditor` hook for tab management
  - Uses `useQueryExecution` hook for query execution
  - Uses `useLocalStorage` for query history persistence

#### 2. **Query Editor System**
- **Tab Management**: Multi-tab SQL editor with create/close functionality
- **Monaco Editor Integration**: Syntax highlighting, autocompletion, custom keybindings
- **Toolbar**: Execute, history, and save functionality
- **Real-time Content Updates**: Automatic tab modification tracking

#### 3. **Result Viewer System**
- **Data Grid**: Sortable, paginated result display
- **Error Handling**: User-friendly error messages
- **Loading States**: Shimmer loading indicators
- **Row Count Display**: Execution statistics

#### 4. **Status Bar**
- **Execution Time**: Query performance metrics
- **Row Count**: Result set statistics
- **Status Indicators**: Success, error, loading states

### Custom Hooks

#### `useQueryEditor` Hook
```typescript
interface UseQueryEditorReturn {
  activeTab: string;
  tabs: QueryTab[];
  createTab: () => void;
  closeTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  markTabAsModified: (tabId: string, modified: boolean) => void;
}
```

**Features**:
- Tab lifecycle management
- Content modification tracking
- Automatic tab switching
- Default tab creation

#### `useQueryExecution` Hook
```typescript
interface UseQueryExecutionReturn {
  executeQuery: (params: QueryExecutionParams) => Promise<QueryResponseType>;
  queryResults: QueryResponseType | null;
  loadingQuery: boolean;
  error: string | null;
  executionTime: number | null;
  rowCount: number | null;
  clearResults: () => void;
  clearError: () => void;
}
```

**Features**:
- Query execution with timing
- Error handling and recovery
- Result state management
- Loading state coordination

## Implementation Phases

### Phase 1: Core Foundation ✅ COMPLETED

**Objective**: Establish the basic SQL editor infrastructure with tab management and query execution.

**Components Implemented**:
1. **Main Container** (`sqlBeeKeeper/index.tsx`)
   - Project and connection integration
   - Query execution coordination
   - History management

2. **Custom Hooks**
   - `useQueryEditor`: Tab management system
   - `useQueryExecution`: Query execution with timing

3. **Basic Components**
   - `QueryEditor`: Main editor container
   - `TabManager`: Tab interface with create/close
   - `EditorToolbar`: Execute and history controls
   - `SqlMonacoEditor`: Monaco editor integration
   - `ResultViewer`: Basic result display
   - `DataGrid`: Sortable data table
   - `StatusBar`: Execution status display

**Key Features**:
- Multi-tab SQL editor
- Query execution with timing
- Basic result display
- Query history with localStorage
- Schema-based autocompletion
- Error handling and loading states

**Technical Achievements**:
- React hooks for state management
- Monaco Editor integration with custom completions
- Material-UI component integration
- TypeScript type safety
- Integration with existing DBT Studio services

### Phase 2: Enhanced UX & Features (Planned)

**Objective**: Improve user experience with advanced features and better visual design.

**Planned Components**:
1. **Advanced Tab Management**
   - Tab reordering (drag & drop)
   - Tab pinning functionality
   - Tab groups and workspaces
   - Unsaved changes indicators

2. **Enhanced Query Editor**
   - Query formatting and beautification
   - SQL syntax validation
   - Query block detection and execution
   - Keyboard shortcuts (Ctrl+Enter, Ctrl+Shift+Enter)
   - Auto-save functionality

3. **Improved Result Viewer**
   - Export functionality (CSV, JSON, Excel)
   - Result pagination
   - Column filtering and searching
   - Result visualization (charts, graphs)
   - Result caching

4. **Advanced History Management**
   - Query categorization and tagging
   - Search and filter history
   - Query templates and snippets
   - Favorite queries

### Phase 3: Advanced Features (Planned)

**Objective**: Add professional-grade features for power users.

**Planned Components**:
1. **Query Analysis**
   - Query performance analysis
   - Execution plan visualization
   - Query optimization suggestions
   - Cost estimation

2. **Collaboration Features**
   - Query sharing and commenting
   - Team query libraries
   - Version control integration
   - Query review workflows

3. **Advanced Data Operations**
   - Bulk data operations
   - Data import/export wizards
   - Schema comparison tools
   - Data profiling

4. **Integration Enhancements**
   - Git integration for query versioning
   - CI/CD pipeline integration
   - API endpoint generation
   - Documentation generation

### Phase 4: Enterprise Features (Planned)

**Objective**: Add enterprise-grade features for large organizations.

**Planned Components**:
1. **Security & Compliance**
   - Query access controls
   - Audit logging
   - Data masking
   - Compliance reporting

2. **Performance & Scalability**
   - Query result caching
   - Background query execution
   - Resource usage monitoring
   - Performance analytics

3. **Administration**
   - User management
   - Query usage analytics
   - System health monitoring
   - Backup and recovery

## Technical Architecture

### State Management Pattern
```typescript
// Global state through React Context
const { schema } = useAppContext();

// Local state through custom hooks
const { activeTab, tabs, createTab } = useQueryEditor();
const { executeQuery, queryResults, loadingQuery } = useQueryExecution();

// Persistent state through localStorage
const [queryHistory, setQueryHistory] = useLocalStorage<QueryHistoryType[]>(
  QUERY_HISTORY_KEY,
  JSON.stringify([])
);
```

### Component Hierarchy
```
SqlBeeKeeper (Main Container)
├── AppLayout
│   ├── SchemaTreeViewer (Sidebar)
│   └── QueryEditor
│       ├── TabManager
│       ├── EditorToolbar
│       └── SqlMonacoEditor
├── ResultViewer (Conditional)
│   └── DataGrid
└── StatusBar
```

### Integration Points

#### Existing DBT Studio Services
- **`connectorsServices`**: Database connection management
- **`projectsServices`**: Project lifecycle management
- **`SchemaTreeViewer`**: Schema exploration
- **`useAppContext`**: Global application state
- **`useGetSelectedProject`**: Project selection
- **`useGetConnectionById`**: Connection management

#### Database Support
- **PostgreSQL**: Full support with schema extraction
- **Snowflake**: Full support with warehouse management
- **BigQuery**: Full support with service account authentication
- **Redshift**: Full support with SSL configuration
- **Databricks**: Full support with token authentication
- **DuckDB**: Full support with file-based storage

### Error Handling Strategy
```typescript
// Query execution error handling
const handleExecuteQuery = async (query: string) => {
  try {
    const result = await executeQuery({
      connection: connectionWithName,
      query,
      projectName: selectedProject.name,
    });
    
    if (result.success && result.data) {
      // Add to history on success
      setQueryHistory([...queryHistory, newHistoryItem]);
    }
  } catch (error) {
    // Error handled by useQueryExecution hook
    console.error('Query execution failed:', error);
  }
};
```

### Performance Optimizations
- **Monaco Editor**: Efficient text editing with syntax highlighting
- **React Query**: Server state caching and invalidation
- **useCallback/useMemo**: Prevent unnecessary re-renders
- **Virtual Scrolling**: For large result sets (planned)
- **Debounced Updates**: For real-time content changes

## Design Patterns

### Beekeeper Studio UX Adaptation
1. **Clean, Minimal Interface**: Focus on content over chrome
2. **Fast, Responsive**: Optimized for quick query execution
3. **Intuitive Navigation**: Clear tab management and history
4. **Professional Appearance**: Material-UI with custom theming
5. **Accessibility**: Keyboard shortcuts and screen reader support

### React/TypeScript Patterns
1. **Functional Components**: With hooks for state management
2. **Custom Hooks**: Encapsulate complex logic
3. **Type Safety**: Comprehensive TypeScript interfaces
4. **Component Composition**: Reusable, composable components
5. **Error Boundaries**: Graceful error handling

### Electron Integration
1. **IPC Communication**: Secure frontend-backend communication
2. **File System Access**: Local query storage and project management
3. **Native Integration**: System dialogs and notifications
4. **Security**: Credential management through secure storage

## Development Guidelines

### Code Style
- **TypeScript**: Strict typing with comprehensive interfaces
- **React Hooks**: Functional components with custom hooks
- **Material-UI**: Consistent theming and component usage
- **Error Handling**: Graceful degradation and user feedback
- **Performance**: Optimized rendering and state management

### Testing Strategy
- **Unit Tests**: Component and hook testing
- **Integration Tests**: Query execution workflows
- **E2E Tests**: Complete user workflows
- **Performance Tests**: Large dataset handling

### Documentation
- **Component Documentation**: Props, events, and usage examples
- **API Documentation**: Service interfaces and data structures
- **User Guide**: Feature documentation and tutorials
- **Developer Guide**: Architecture and contribution guidelines

## Future Enhancements

### Planned Features
1. **Query Templates**: Pre-built query snippets
2. **Query Scheduling**: Automated query execution
3. **Data Visualization**: Chart and graph integration
4. **Query Optimization**: Performance analysis and suggestions
5. **Collaboration**: Team query sharing and review

### Technical Improvements
1. **WebAssembly**: For client-side data processing
2. **Service Workers**: For offline query caching
3. **WebGL**: For large dataset visualization
4. **WebRTC**: For real-time collaboration
5. **Progressive Web App**: For mobile access

## Conclusion

The DBT Beekeeper SQL Studio represents a modern, user-friendly approach to SQL editing within the DBT Studio ecosystem. By adapting Beekeeper Studio's proven UX patterns to React/TypeScript, we've created a powerful, extensible foundation for database querying that integrates seamlessly with existing DBT Studio functionality.

The phased implementation approach ensures steady progress while maintaining code quality and user experience. Each phase builds upon the previous, creating a robust and feature-rich SQL editor that meets the needs of both casual and power users. 