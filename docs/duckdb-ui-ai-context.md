# Duck-UI AI Context

## Repository Overview

**Location**: `/Users/nuri/Documents/Projects/Adaptivescale/combined-dbt-project/duck-ui`  
**Repository**: https://github.com/ibero-data/duck-ui  
**Version**: 0.0.24 (Released: 2026-01-20)  
**License**: Apache 2.0

Duck-UI is a modern web-based interface for DuckDB that runs entirely in the browser using WebAssembly. It provides a powerful SQL editor and data analysis platform without requiring any server infrastructure.

## Core Technology Stack

### Frontend Framework
- **React 19.2.3** - UI framework
- **TypeScript 5.9.3** - Type safety
- **Vite 7.3.1** - Build tool and dev server
- **React Router 7.12.0** - Client-side routing

### Database Engine
- **@duckdb/duckdb-wasm 1.33.1-dev17.0** - DuckDB WebAssembly runtime
- Runs entirely in browser via WebAssembly
- No backend server required for local analysis

### State Management
- **Zustand 5.0.10** - Lightweight state management
- Persistent storage with IndexedDB
- Centralized store at `src/store/index.ts`

### UI Components
- **Radix UI** - Accessible component primitives
- **Tailwind CSS 4.1.18** - Utility-first styling
- **Lucide React** - Icon library
- **Monaco Editor 0.54.0** - SQL code editor (VS Code editor)
- **Framer Motion** - Animations

### AI Integration
- **@mlc-ai/web-llm 0.2.80** - Local AI inference via WebGPU
- **OpenAI SDK** - Cloud AI integration
- Supports OpenAI, Anthropic, and Google Gemini

### Data Visualization
- **ECharts 6.0.0** - Advanced charting library
- **Recharts 3.6.0** - React chart components
- **@tanstack/react-table 8.21.3** - Table virtualization

### File Processing
- **PapaParse 5.5.3** - CSV parsing
- **XLSX 0.18.5** - Excel file support
- **fflate 0.8.2** - Compression

## Key Features

### 1. Browser-Based DuckDB (WASM Mode)
- DuckDB runs entirely in browser via WebAssembly
- No server setup required
- All data processing happens client-side
- Privacy-first: data never leaves your machine
- Near-native performance

### 2. SQL Editor
- Monaco editor with IntelliSense
- Syntax highlighting for SQL
- Auto-completion for tables and columns
- Multiple query tabs
- Query history (last 15 queries)
- Keyboard shortcuts:
  - `Cmd/Ctrl + Enter`: Run query
  - `Cmd/Ctrl + Shift + Enter`: Run highlighted query
  - `Cmd/Ctrl + B`: Toggle sidebar
  - `Cmd/Ctrl + K`: Open search

### 3. Data Import
Supports multiple file formats:
- **CSV/TSV** - Comma/tab-separated values
- **JSON/JSONL** - JSON objects and newline-delimited JSON
- **Parquet** - Apache Parquet columnar format
- **Arrow/IPC** - Apache Arrow format
- **Excel** (.xlsx, .xls) - Microsoft Excel spreadsheets
- **DuckDB** (.duckdb, .db) - DuckDB database files

Import sources:
- Local file upload
- HTTP/HTTPS URLs
- Mounted folders (Chrome/Edge only)
- Query results

### 4. OPFS Storage (Persistent Databases)
- Store databases in Origin Private File System
- Data persists across browser sessions
- Automatic in supported browsers (Chrome 86+, Edge 86+)
- No configuration needed
- Path format: `opfs://database_name.db`

### 5. External Connections
Connect to remote DuckDB servers via HTTP API:
- HTTP/HTTPS protocol support
- Authentication modes:
  - None
  - Basic auth (username/password)
  - API key
- Configurable via environment variables
- Shared database access for teams

### 6. Persistent Folder Access
**Browser Support**: Chrome/Edge 86+, Opera 72+

- Mount folders from local filesystem
- Folder selections persist across sessions (IndexedDB)
- Tree view browser for files
- One-click import to DuckDB (right-click file)
- Real-time file contents
- Supported file types automatically detected

**Implementation**:
- Uses File System Access API
- Handles stored in IndexedDB
- Permission re-grant required on reload (browser security)
- Service: `src/lib/fileSystem/index.ts`
- Component: `src/components/folders/FolderBrowser.tsx`

### 7. Duck Brain AI Assistant
Natural language to SQL conversion with two modes:

#### Local AI (WebLLM)
- Runs entirely in browser via WebGPU
- **Browser Support**: Chrome/Edge 113+ (requires WebGPU)
- Models available:
  - **Phi-3.5 Mini** (~2.3GB) - Best quality, recommended
  - Llama 3.2 1B (~1.1GB) - Fastest
  - Qwen 2.5 1.5B (~1GB) - Balanced
- First load downloads model (~2GB)
- Cached for future sessions
- Complete privacy: no data leaves browser

#### Cloud AI
- OpenAI (GPT-4o, GPT-4o Mini, GPT-3.5 Turbo)
- Anthropic (Claude Sonnet 4, Claude 3.5 Sonnet/Haiku)
- Google (Gemini 1.5 Pro/Flash)
- Works in any modern browser
- Requires API key

**Features**:
- Schema-aware: understands your tables and columns
- `@` syntax for table/column references
- Inline query execution
- Streaming responses
- Query explanation
- Implementation: `src/lib/duckBrain/`

### 8. Data Explorer
- Browse databases, tables, and columns
- View table schemas and row counts
- Column statistics on demand
- Preview table data
- Delete tables
- Tree view interface

### 9. Advanced Charting
Chart types supported:
- Bar (grouped, stacked)
- Line (smooth, multi-series)
- Area (stacked)
- Pie/Donut
- Scatter/Bubble
- Heatmap
- Treemap
- Funnel
- Gauge
- Box plot

Features:
- Multi-series support
- Dual Y-axis
- Data transformations (group by, aggregation, sorting, filtering)
- Custom color palettes
- Annotations
- Export to PNG
- Configuration: `ChartConfig` interface in store

### 10. Cloud Storage Integration
- Connect to cloud storage providers
- Service: `src/lib/cloudStorage/`
- Support status checking
- Connection management

## Architecture

### State Management (Zustand Store)

**Location**: `src/store/index.ts` (2580 lines)

Key state slices:
```typescript
interface DuckStoreState {
  // Database instances
  db: AsyncDuckDB | null;
  connection: AsyncDuckDBConnection | null;
  wasmDb: AsyncDuckDB | null;
  wasmConnection: AsyncDuckDBConnection | null;
  opfsDb: AsyncDuckDB | null;
  opfsConnection: AsyncDuckDBConnection | null;
  
  // Connection management
  currentConnection: CurrentConnection | null;
  connectionList: ConnectionList;
  
  // Data explorer
  databases: DatabaseInfo[];
  
  // Query management
  queryHistory: QueryHistoryItem[];
  isExecuting: boolean;
  
  // Tab management
  tabs: EditorTab[];
  activeTabId: string | null;
  
  // Duck Brain AI
  duckBrain: {
    modelStatus: "idle" | "checking" | "downloading" | "loading" | "ready" | "error";
    messages: DuckBrainMessage[];
    isGenerating: boolean;
    aiProvider: AIProviderType;
    providerConfigs: ProviderConfigs;
  };
  
  // File system
  mountedFolders: MountedFolderInfo[];
  isFileSystemSupported: boolean;
  
  // Cloud storage
  cloudConnections: CloudConnection[];
}
```

### Connection Types

1. **WASM (Local)**
   - Default mode
   - In-memory database
   - No persistence (unless saved to OPFS)
   - Fastest for temporary analysis

2. **OPFS (Persistent)**
   - Browser's Origin Private File System
   - Data persists across sessions
   - Path format: `opfs://filename.db`
   - Automatic in supported browsers

3. **External (HTTP)**
   - Remote DuckDB server
   - HTTP API communication
   - Shared access
   - Requires server setup

### Query Execution Flow

```
User Input → Store Action → Connection Type Check
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
              WASM/OPFS                        External
                    ↓                               ↓
         connection.query()              executeExternalQuery()
                    ↓                               ↓
            resultToJSON()                  rawResultToJSON()
                    ↓                               ↓
                    └───────────────┬───────────────┘
                                    ↓
                            QueryResult
                                    ↓
                          Update Tab State
```

### Component Structure

```
src/
├── components/
│   ├── charts/          # Chart visualization components
│   ├── cloud/           # Cloud storage UI
│   ├── connection/      # Connection management
│   ├── duck-brain/      # AI assistant UI
│   ├── editor/          # SQL editor (Monaco)
│   ├── explorer/        # Data explorer sidebar
│   ├── folders/         # Folder browser
│   ├── layout/          # App layout components
│   ├── table/           # Result table display
│   ├── ui/              # Radix UI components
│   └── workspace/       # Tab management
├── hooks/               # Custom React hooks
├── lib/
│   ├── cloudStorage/    # Cloud storage service
│   ├── duckBrain/       # AI provider implementations
│   ├── fileSystem/      # File System Access API
│   └── utils.ts         # Utility functions
├── pages/
│   └── Home.tsx         # Main application page
├── store/
│   └── index.ts         # Zustand store (2580 lines)
└── types/               # TypeScript type definitions
```

## Environment Variables

### External Connection
- `DUCK_UI_EXTERNAL_CONNECTION_NAME` - Display name
- `DUCK_UI_EXTERNAL_HOST` - Server URL
- `DUCK_UI_EXTERNAL_PORT` - Server port
- `DUCK_UI_EXTERNAL_USER` - Username
- `DUCK_UI_EXTERNAL_PASS` - Password
- `DUCK_UI_EXTERNAL_DATABASE_NAME` - Database name

### Extensions
- `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS` - Allow unsigned DuckDB extensions (default: false)

## Deployment

### Docker (Recommended)
```bash
docker run -p 5522:5522 ghcr.io/ibero-data/duck-ui:latest
```

Access at: `http://localhost:5522`

### Build from Source
```bash
git clone https://github.com/ibero-data/duck-ui.git
cd duck-ui
bun install
bun run build
bun run preview
```

### Development
```bash
bun run dev  # Starts at http://localhost:5173
```

## Browser Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| WASM DuckDB | 88+ | 88+ | 79+ | 14+ |
| OPFS Storage | 86+ | 86+ | Limited | Limited |
| Folder Access | 86+ | 86+ | ❌ | ❌ |
| Local AI (WebGPU) | 113+ | 113+ | ❌ | ❌ |
| Cloud AI | All | All | All | All |

## Key Implementation Details

### OPFS Connection Management
- Tracks active paths to prevent concurrent access
- Exponential backoff retry for handle conflicts
- Proper cleanup with 2-second delay for handle release
- Path normalization: removes leading slash, ensures .db extension

### Query Result Conversion
- Handles Decimal types (applies scale from Arrow metadata)
- Fixes Date32, Date64, Timestamp types
- Converts Arrow format to JSON
- Supports both WASM and external query results

### External Query Execution
- Supports both single JSON and NDJSON (newline-delimited) responses
- Proper URL construction with scheme and port handling
- Multiple auth modes: none, basic auth, API key
- Comprehensive error handling with network and auth errors

### Embedded Databases
- Loads databases from `public/databases/` directory
- Manifest file: `public/databases/manifest.json`
- Auto-attach on initialization
- Configurable auto-load per database

## Integration Points for dbt-studio

### 1. SQL Editor Integration
- Monaco editor already configured
- Query execution infrastructure in place
- Tab management system ready
- Can reuse editor component: `src/components/editor/`

### 2. DuckDB WASM Integration
- Proven WASM initialization: `initializeWasmConnection()`
- Connection management: multiple DB instances supported
- Query execution: `executeQuery()` action
- File registration: `db.registerFileBuffer()`

### 3. Data Import
- File import infrastructure: `importFile()` action
- Multiple format support (CSV, JSON, Parquet, Excel)
- URL import capability
- Can integrate with dbt model outputs

### 4. Folder Access
- File System Access API implementation ready
- Persistent folder mounting
- Tree view browser component
- Can mount dbt project directories

### 5. AI Assistant
- Duck Brain architecture can be adapted
- Schema-aware SQL generation
- Local and cloud AI support
- Can help with dbt model development

### 6. Visualization
- Advanced charting with ECharts
- Multiple chart types
- Data transformation pipeline
- Can visualize dbt model results

## Potential Integration Scenarios

### Scenario 1: Embedded DuckDB in dbt-studio
- Use Duck-UI's WASM initialization code
- Integrate SQL editor for ad-hoc queries
- Import dbt model outputs (Parquet/CSV)
- Visualize model results with charts

### Scenario 2: Folder Access for dbt Projects
- Mount dbt project directory
- Browse models, seeds, snapshots
- Quick preview of data files
- Import seeds directly to DuckDB

### Scenario 3: AI-Assisted dbt Development
- Adapt Duck Brain for dbt-specific queries
- Generate dbt model SQL from natural language
- Schema-aware suggestions
- Model documentation generation

### Scenario 4: Data Preview & Testing
- Quick data preview for dbt models
- Test queries before adding to models
- Validate transformations
- Debug data issues

## Documentation

- **Official Docs**: https://duckui.com
- **Live Demo**: https://demo.duckui.com
- **GitHub**: https://github.com/ibero-data/duck-ui
- **Issues**: https://github.com/ibero-data/duck-ui/issues
- **Discussions**: https://github.com/ibero-data/duck-ui/discussions

## Sponsors

- **Ibero Data** - https://www.iberodata.es
- **QXIP** - https://qxip.net

## Notes for Integration

1. **State Management**: Duck-UI uses Zustand - consider if compatible with dbt-studio's state management
2. **Monaco Editor**: Both projects may use Monaco - can share configuration
3. **DuckDB Version**: Ensure version compatibility between Duck-UI and dbt-studio
4. **File System API**: Chrome/Edge only - need fallback for other browsers
5. **WebGPU for AI**: Limited browser support - cloud AI as fallback
6. **OPFS Storage**: Consider for persistent dbt model cache
7. **Build Tool**: Duck-UI uses Vite - dbt-studio uses Webpack (Electron)

## Contact

- **Author**: Caio Ricciuti
- **GitHub**: https://github.com/caioricciuti
- **Sponsorship**: caio.ricciuti+sponsorship@outlook.com
