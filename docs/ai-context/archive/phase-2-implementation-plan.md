# Phase 2 Implementation Plan: Enhanced UX & Features

## Overview

Phase 2 focuses on improving user experience with advanced features and better visual design. This phase builds upon the solid foundation established in Phase 1, adding professional-grade features that enhance productivity and user satisfaction.

## Phase 2 Objectives

1. **Advanced Tab Management**: Drag & drop, pinning, workspaces
2. **Enhanced Query Editor**: Formatting, validation, keyboard shortcuts
3. **Improved Result Viewer**: Export, pagination, filtering, visualization
4. **Advanced History Management**: Categorization, search, templates

## Implementation Timeline

**Estimated Duration**: 4-6 weeks
**Sprint Structure**: 2-week sprints with 3 sprints total

### Sprint 1 (Weeks 1-2): Advanced Tab Management
### Sprint 2 (Weeks 3-4): Enhanced Query Editor
### Sprint 3 (Weeks 5-6): Result Viewer & History Improvements

---

## Sprint 1: Advanced Tab Management

### 1.1 Tab Reordering (Drag & Drop)

**Objective**: Allow users to reorder tabs by dragging and dropping.

**Technical Implementation**:
```typescript
// New hook: useTabDragAndDrop
interface UseTabDragAndDropReturn {
  isDragging: boolean;
  draggedTabId: string | null;
  handleTabDragStart: (tabId: string) => void;
  handleTabDragEnd: () => void;
  handleTabDrop: (targetTabId: string) => void;
}

// Enhanced TabManager component
interface TabManagerProps {
  // ... existing props
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  isDragging: boolean;
  draggedTabId: string | null;
}
```

**Components to Create/Modify**:
- `src/renderer/screens/sqlBeeKeeper/hooks/useTabDragAndDrop.ts`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/TabManager.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useQueryEditor.ts` (enhance)

**Features**:
- Visual drag indicators
- Smooth animations
- Keyboard accessibility (Ctrl+Shift+Arrow keys)
- Touch support for mobile

### 1.2 Tab Pinning Functionality

**Objective**: Allow users to pin important tabs to prevent accidental closure.

**Technical Implementation**:
```typescript
// Enhanced QueryTab interface
interface QueryTab {
  id: string;
  title: string;
  content: string;
  isModified: boolean;
  isPinned: boolean; // New field
  result?: any;
  error?: string;
}

// Enhanced useQueryEditor hook
interface UseQueryEditorReturn {
  // ... existing methods
  pinTab: (tabId: string) => void;
  unpinTab: (tabId: string) => void;
}
```

**Components to Create/Modify**:
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/TabManager.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useQueryEditor.ts`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/PinnedTabIndicator.tsx`

**Features**:
- Pin/unpin button on each tab
- Visual pin indicator
- Pinned tabs stay at the beginning
- Confirmation dialog for closing pinned tabs

### 1.3 Tab Groups and Workspaces

**Objective**: Organize tabs into logical groups for better project management.

**Technical Implementation**:
```typescript
// New interfaces
interface TabGroup {
  id: string;
  name: string;
  tabs: string[]; // tab IDs
  color: string;
  isCollapsed: boolean;
}

interface Workspace {
  id: string;
  name: string;
  groups: TabGroup[];
  activeGroupId: string;
}

// Enhanced useQueryEditor hook
interface UseQueryEditorReturn {
  // ... existing methods
  createTabGroup: (name: string, color: string) => void;
  addTabToGroup: (tabId: string, groupId: string) => void;
  removeTabFromGroup: (tabId: string) => void;
  collapseGroup: (groupId: string) => void;
  expandGroup: (groupId: string) => void;
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/TabGroupManager.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/WorkspaceSelector.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useTabGroups.ts`
- `src/renderer/screens/sqlBeeKeeper/hooks/useWorkspaces.ts`

**Features**:
- Color-coded tab groups
- Collapsible groups
- Workspace switching
- Group-specific settings

### 1.4 Unsaved Changes Indicators

**Objective**: Clearly indicate which tabs have unsaved changes.

**Technical Implementation**:
```typescript
// Enhanced QueryTab interface
interface QueryTab {
  // ... existing fields
  hasUnsavedChanges: boolean;
  lastSavedContent: string;
  autoSaveEnabled: boolean;
}

// Enhanced useQueryEditor hook
interface UseQueryEditorReturn {
  // ... existing methods
  saveTab: (tabId: string) => Promise<void>;
  enableAutoSave: (tabId: string) => void;
  disableAutoSave: (tabId: string) => void;
}
```

**Components to Create/Modify**:
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/TabManager.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/SaveIndicator.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useAutoSave.ts`

**Features**:
- Visual indicators for unsaved changes
- Auto-save functionality
- Manual save with Ctrl+S
- Save all functionality

---

## Sprint 2: Enhanced Query Editor

### 2.1 Query Formatting and Beautification

**Objective**: Automatically format SQL queries for better readability.

**Technical Implementation**:
```typescript
// New service for SQL formatting
interface SqlFormatter {
  format: (sql: string, options?: FormatOptions) => string;
  minify: (sql: string) => string;
  validate: (sql: string) => ValidationResult;
}

interface FormatOptions {
  indentSize: number;
  keywordCase: 'upper' | 'lower' | 'preserve';
  maxLineLength: number;
  alignClauses: boolean;
}

// Enhanced SqlMonacoEditor component
interface SqlMonacoEditorProps {
  // ... existing props
  onFormat: () => void;
  onMinify: () => void;
  formatOnPaste: boolean;
  formatOnSave: boolean;
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/services/sqlFormatter.ts`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/FormatToolbar.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useSqlFormatting.ts`

**Features**:
- Format on Ctrl+Shift+F
- Minify on Ctrl+Shift+M
- Format on paste option
- Format on save option
- Custom formatting rules

### 2.2 SQL Syntax Validation

**Objective**: Provide real-time SQL syntax validation and error highlighting.

**Technical Implementation**:
```typescript
// New service for SQL validation
interface SqlValidator {
  validate: (sql: string, dialect: string) => ValidationResult[];
  getSuggestions: (sql: string, position: number) => Suggestion[];
  getErrors: (sql: string) => ValidationError[];
}

interface ValidationResult {
  type: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  column: number;
  length: number;
  code: string;
}

// Enhanced SqlMonacoEditor component
interface SqlMonacoEditorProps {
  // ... existing props
  validationEnabled: boolean;
  showInlineErrors: boolean;
  errorMarkers: ValidationResult[];
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/services/sqlValidator.ts`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/ValidationPanel.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useSqlValidation.ts`

**Features**:
- Real-time syntax checking
- Error highlighting in editor
- Validation panel with details
- Quick-fix suggestions
- Database-specific validation

### 2.3 Query Block Detection and Execution

**Objective**: Execute specific query blocks instead of entire editor content.

**Technical Implementation**:
```typescript
// New service for query block detection
interface QueryBlockDetector {
  detectBlocks: (sql: string) => QueryBlock[];
  getBlockAtPosition: (sql: string, position: number) => QueryBlock | null;
  highlightBlock: (block: QueryBlock) => void;
}

interface QueryBlock {
  id: string;
  startLine: number;
  endLine: number;
  content: string;
  type: 'select' | 'insert' | 'update' | 'delete' | 'create' | 'drop' | 'other';
  isExecutable: boolean;
}

// Enhanced SqlMonacoEditor component
interface SqlMonacoEditorProps {
  // ... existing props
  onExecuteBlock: (block: QueryBlock) => void;
  selectedBlock: QueryBlock | null;
  blockHighlighting: boolean;
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/services/queryBlockDetector.ts`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/BlockSelector.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useQueryBlocks.ts`

**Features**:
- Visual block highlighting
- Execute current block (Ctrl+Enter)
- Execute all blocks (Ctrl+Shift+Enter)
- Block type detection
- Non-executable block warnings

### 2.4 Enhanced Keyboard Shortcuts

**Objective**: Provide comprehensive keyboard shortcuts for power users.

**Technical Implementation**:
```typescript
// New service for keyboard shortcuts
interface KeyboardShortcuts {
  register: (shortcut: string, action: () => void) => void;
  unregister: (shortcut: string) => void;
  isRegistered: (shortcut: string) => boolean;
  getShortcuts: () => ShortcutMap;
}

interface ShortcutMap {
  [shortcut: string]: {
    action: () => void;
    description: string;
    category: string;
  };
}

// Enhanced SqlMonacoEditor component
interface SqlMonacoEditorProps {
  // ... existing props
  shortcuts: ShortcutMap;
  onShortcut: (shortcut: string) => void;
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/services/keyboardShortcuts.ts`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/ShortcutsPanel.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useKeyboardShortcuts.ts`

**Features**:
- Ctrl+Enter: Execute current block
- Ctrl+Shift+Enter: Execute all blocks
- Ctrl+S: Save current tab
- Ctrl+Shift+S: Save all tabs
- Ctrl+F: Find in editor
- Ctrl+Shift+F: Format query
- Ctrl+Shift+M: Minify query
- Ctrl+Shift+H: Show history
- Ctrl+Shift+T: New tab
- Ctrl+W: Close current tab
- Ctrl+Tab: Next tab
- Ctrl+Shift+Tab: Previous tab

### 2.5 Auto-save Functionality

**Objective**: Automatically save query content to prevent data loss.

**Technical Implementation**:
```typescript
// New hook for auto-save functionality
interface UseAutoSaveReturn {
  isAutoSaveEnabled: boolean;
  autoSaveInterval: number;
  lastSaved: Date | null;
  enableAutoSave: () => void;
  disableAutoSave: () => void;
  setAutoSaveInterval: (interval: number) => void;
  saveNow: () => Promise<void>;
}

// Enhanced useQueryEditor hook
interface UseQueryEditorReturn {
  // ... existing methods
  autoSaveTab: (tabId: string) => Promise<void>;
  getAutoSaveStatus: (tabId: string) => AutoSaveStatus;
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/hooks/useAutoSave.ts`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/AutoSaveIndicator.tsx`
- `src/renderer/screens/sqlBeeKeeper/services/autoSaveService.ts`

**Features**:
- Configurable auto-save intervals
- Visual auto-save indicators
- Manual save override
- Auto-save to localStorage
- Auto-save to file system (optional)

---

## Sprint 3: Result Viewer & History Improvements

### 3.1 Export Functionality

**Objective**: Allow users to export query results in various formats.

**Technical Implementation**:
```typescript
// New service for data export
interface DataExporter {
  exportToCsv: (data: any[], filename: string) => void;
  exportToJson: (data: any[], filename: string) => void;
  exportToExcel: (data: any[], filename: string) => void;
  exportToSql: (data: any[], tableName: string) => string;
}

// Enhanced ResultViewer component
interface ResultViewerProps {
  // ... existing props
  onExport: (format: ExportFormat, filename?: string) => void;
  exportFormats: ExportFormat[];
  maxExportRows: number;
}

type ExportFormat = 'csv' | 'json' | 'excel' | 'sql';
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/services/dataExporter.ts`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/ExportToolbar.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/ExportDialog.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useDataExport.ts`

**Features**:
- Export to CSV, JSON, Excel, SQL
- Custom filename and path
- Export selected rows only
- Export with headers
- Progress indicators for large exports

### 3.2 Result Pagination

**Objective**: Handle large result sets efficiently with pagination.

**Technical Implementation**:
```typescript
// New hook for result pagination
interface UseResultPaginationReturn {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalRows: number;
  paginatedData: any[];
  goToPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  previousPage: () => void;
}

// Enhanced DataGrid component
interface DataGridProps {
  // ... existing props
  pagination: UseResultPaginationReturn;
  showPagination: boolean;
  pageSizeOptions: number[];
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/hooks/useResultPagination.ts`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/PaginationControls.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/PageSizeSelector.tsx`

**Features**:
- Configurable page sizes (10, 25, 50, 100, 500)
- Page navigation controls
- Row count display
- Jump to page functionality
- URL state persistence

### 3.3 Column Filtering and Searching

**Objective**: Allow users to filter and search within result sets.

**Technical Implementation**:
```typescript
// New hook for result filtering
interface UseResultFilteringReturn {
  filters: ColumnFilter[];
  searchTerm: string;
  filteredData: any[];
  addFilter: (column: string, operator: FilterOperator, value: any) => void;
  removeFilter: (filterId: string) => void;
  setSearchTerm: (term: string) => void;
  clearAllFilters: () => void;
}

interface ColumnFilter {
  id: string;
  column: string;
  operator: FilterOperator;
  value: any;
  enabled: boolean;
}

type FilterOperator = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between';

// Enhanced DataGrid component
interface DataGridProps {
  // ... existing props
  filtering: UseResultFilteringReturn;
  showFilters: boolean;
  searchEnabled: boolean;
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/hooks/useResultFiltering.ts`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/FilterPanel.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/SearchBox.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/FilterChip.tsx`

**Features**:
- Column-specific filters
- Global search across all columns
- Multiple filter operators
- Filter chips for quick removal
- Filter persistence
- Advanced filter combinations

### 3.4 Result Visualization

**Objective**: Provide basic chart and graph capabilities for result visualization.

**Technical Implementation**:
```typescript
// New service for data visualization
interface DataVisualizer {
  createChart: (data: any[], config: ChartConfig) => Chart;
  getChartTypes: () => ChartType[];
  validateData: (data: any[], chartType: ChartType) => ValidationResult;
}

interface ChartConfig {
  type: ChartType;
  xAxis: string;
  yAxis: string;
  title: string;
  colors: string[];
  options: any;
}

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'table';

// Enhanced ResultViewer component
interface ResultViewerProps {
  // ... existing props
  onVisualize: (config: ChartConfig) => void;
  availableCharts: ChartType[];
  currentChart: Chart | null;
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/services/dataVisualizer.ts`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/ChartSelector.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/ChartConfigPanel.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/ResultViewer/ChartDisplay.tsx`
- `src/renderer/screens/sqlBeeKeeper/hooks/useDataVisualization.ts`

**Features**:
- Bar, line, pie, scatter, area charts
- Interactive chart configuration
- Chart export (PNG, SVG, PDF)
- Chart templates
- Auto-chart type detection

### 3.5 Advanced History Management

**Objective**: Enhanced query history with categorization, search, and templates.

**Technical Implementation**:
```typescript
// Enhanced QueryHistoryType interface
interface QueryHistoryType {
  id: string;
  executedAt: Date;
  results: QueryResponseType;
  projectId: string;
  projectName: string;
  query: string;
  // New fields
  category: string;
  tags: string[];
  description: string;
  isFavorite: boolean;
  executionTime: number;
  rowCount: number;
  error?: string;
}

// New hook for enhanced history management
interface UseQueryHistoryReturn {
  history: QueryHistoryType[];
  categories: string[];
  tags: string[];
  favorites: QueryHistoryType[];
  addToHistory: (item: QueryHistoryType) => void;
  removeFromHistory: (id: string) => void;
  updateHistoryItem: (id: string, updates: Partial<QueryHistoryType>) => void;
  searchHistory: (query: string) => QueryHistoryType[];
  filterByCategory: (category: string) => QueryHistoryType[];
  filterByTags: (tags: string[]) => QueryHistoryType[];
  toggleFavorite: (id: string) => void;
  clearHistory: () => void;
}
```

**Components to Create**:
- `src/renderer/screens/sqlBeeKeeper/hooks/useQueryHistory.ts`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/EnhancedHistoryPanel.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/HistorySearch.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/HistoryCategories.tsx`
- `src/renderer/screens/sqlBeeKeeper/components/QueryEditor/QueryTemplates.tsx`

**Features**:
- Query categorization
- Tag-based organization
- Search and filter history
- Favorite queries
- Query templates and snippets
- History export/import
- Bulk operations

---

## Technical Requirements

### Dependencies to Add
```json
{
  "dependencies": {
    "react-beautiful-dnd": "^13.1.1",
    "sql-formatter": "^12.2.2",
    "xlsx": "^0.18.5",
    "recharts": "^2.8.0",
    "react-hotkeys-hook": "^4.4.1",
    "debounce": "^1.2.1"
  }
}
```

### New File Structure
```
src/renderer/screens/sqlBeeKeeper/
├── components/
│   ├── QueryEditor/
│   │   ├── TabManager.tsx (enhanced)
│   │   ├── TabGroupManager.tsx (new)
│   │   ├── WorkspaceSelector.tsx (new)
│   │   ├── FormatToolbar.tsx (new)
│   │   ├── ValidationPanel.tsx (new)
│   │   ├── BlockSelector.tsx (new)
│   │   ├── ShortcutsPanel.tsx (new)
│   │   ├── AutoSaveIndicator.tsx (new)
│   │   ├── EnhancedHistoryPanel.tsx (new)
│   │   └── QueryTemplates.tsx (new)
│   └── ResultViewer/
│       ├── ExportToolbar.tsx (new)
│       ├── ExportDialog.tsx (new)
│       ├── PaginationControls.tsx (new)
│       ├── FilterPanel.tsx (new)
│       ├── SearchBox.tsx (new)
│       ├── ChartSelector.tsx (new)
│       └── ChartDisplay.tsx (new)
├── hooks/
│   ├── useTabDragAndDrop.ts (new)
│   ├── useTabGroups.ts (new)
│   ├── useWorkspaces.ts (new)
│   ├── useAutoSave.ts (new)
│   ├── useSqlFormatting.ts (new)
│   ├── useSqlValidation.ts (new)
│   ├── useQueryBlocks.ts (new)
│   ├── useKeyboardShortcuts.ts (new)
│   ├── useResultPagination.ts (new)
│   ├── useResultFiltering.ts (new)
│   ├── useDataVisualization.ts (new)
│   └── useQueryHistory.ts (enhanced)
└── services/
    ├── sqlFormatter.ts (new)
    ├── sqlValidator.ts (new)
    ├── queryBlockDetector.ts (new)
    ├── keyboardShortcuts.ts (new)
    ├── autoSaveService.ts (new)
    ├── dataExporter.ts (new)
    ├── dataVisualizer.ts (new)
    └── enhancedHistoryService.ts (new)
```

### Testing Strategy

#### Unit Tests
- All new hooks with comprehensive test coverage
- Service functions with mock data
- Component rendering and interaction tests
- Keyboard shortcut functionality tests

#### Integration Tests
- Tab management workflows
- Query execution with formatting
- Export functionality with various formats
- History management operations

#### E2E Tests
- Complete user workflows from query writing to result export
- Cross-browser compatibility
- Performance testing with large datasets

### Performance Considerations

1. **Virtual Scrolling**: For large result sets (>1000 rows)
2. **Debounced Updates**: For real-time filtering and search
3. **Lazy Loading**: For chart components and heavy visualizations
4. **Memory Management**: Proper cleanup of Monaco Editor instances
5. **Caching**: Query results and formatted SQL

### Accessibility Requirements

1. **Keyboard Navigation**: Full keyboard support for all features
2. **Screen Reader**: Proper ARIA labels and descriptions
3. **High Contrast**: Support for high contrast themes
4. **Focus Management**: Logical tab order and focus indicators
5. **Error Handling**: Clear error messages and recovery options

---

## Success Metrics

### User Experience
- **Tab Management**: 90% of users can successfully reorder and pin tabs
- **Query Editor**: 80% reduction in syntax errors with validation
- **Result Viewer**: 70% of users utilize export functionality
- **History**: 60% of users create and use query templates

### Performance
- **Load Time**: <2 seconds for initial editor load
- **Query Execution**: <5 seconds for queries returning <10k rows
- **Export Speed**: <10 seconds for 100k row exports
- **Memory Usage**: <500MB for typical usage patterns

### Code Quality
- **Test Coverage**: >90% for new components and hooks
- **Type Safety**: 100% TypeScript coverage for new code
- **Documentation**: Complete JSDoc coverage for all new functions
- **Linting**: Zero ESLint errors or warnings

---

## Risk Mitigation

### Technical Risks
1. **Monaco Editor Performance**: Implement virtual scrolling for large files
2. **Memory Leaks**: Proper cleanup in useEffect hooks
3. **Browser Compatibility**: Test across Chrome, Firefox, Safari, Edge
4. **Large Dataset Handling**: Implement pagination and streaming

### User Experience Risks
1. **Feature Overload**: Progressive disclosure of advanced features
2. **Learning Curve**: Comprehensive onboarding and tooltips
3. **Performance Impact**: Optimize for common use cases
4. **Accessibility**: Regular accessibility audits

### Timeline Risks
1. **Scope Creep**: Strict adherence to Phase 2 scope
2. **Technical Debt**: Regular refactoring and code reviews
3. **Integration Issues**: Early testing with existing components
4. **Dependency Conflicts**: Careful version management

---

## Conclusion

Phase 2 represents a significant enhancement to the DBT Beekeeper SQL Studio, transforming it from a basic SQL editor into a professional-grade development tool. The phased approach ensures steady progress while maintaining code quality and user experience.

Each sprint builds upon the previous, creating a cohesive and powerful SQL editing experience that rivals commercial alternatives while maintaining the unique integration with DBT Studio's ecosystem. 