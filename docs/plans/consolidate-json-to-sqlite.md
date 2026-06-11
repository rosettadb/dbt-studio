# Plan: Consolidate database.json into SQLite (main-database.db)

## Context

DBT Studio currently has **two storage systems**:
1. **database.json** — JSON file storing core app data (projects, connections, settings, saved queries, cloud sources, recent items). Uses a fragile read-modify-write-entire-file pattern with an async mutex.
2. **main-database.db** — SQLite database (better-sqlite3 + Drizzle ORM) storing AI/chat features. Already has WAL mode, foreign keys, and proper schema management.

**Why this change:** The JSON file approach has inherent risks — no ACID guarantees, entire-file rewrites on every save, no partial update capability, and vulnerability to corruption on crash during write. Moving to SQLite gives us transactional safety, concurrent read access, proper backup via `VACUUM INTO`, and a single file to manage.

**Decision: SQLite (not DuckDB)** because:
- Already in use with battle-tested infrastructure (better-sqlite3 + Drizzle ORM)
- Purpose-built for OLTP (frequent small reads/writes) — DuckDB is OLAP-optimized
- Smaller binary, native Drizzle support, proven in Electron apps
- No new dependencies needed

---

## Phase 1: Schema & Foundation (no behavior changes)

### 1.1 Add new table definitions to Drizzle schema
**File:** `src/main/schemas/mainDatabase.schema.ts`

Add 8 new tables:

| Table | Purpose | Key Design Choice |
|-------|---------|-------------------|
| `projects` | Store Project objects | All scalar fields as columns. `connection`, `rosettaConnection`, `dbtConnection` are NOT stored (computed at runtime by joining with connections table, matching existing `loadProjects()` pattern) |
| `connections` | Store ConnectionModel objects | `connection_data` as JSON column — ConnectionInput is a union of 8 types with different field sets, same pattern as existing `ai_providers.config` |
| `settings` | App settings (key-value) | Key-value design since SettingsType changes shape between versions. `loadSettings()` reads all rows, merges onto defaults |
| `saved_queries` | Saved SQL queries | Flat table with `connection_id` index, replacing the nested `Record<string, SavedQuery[]>` structure |
| `cloud_sources` | Cloud storage connections (S3, GCS, Azure) | `config` as JSON column for polymorphic CloudStoragePersistedConfig |
| `recent_items` | Recently accessed cloud items | Indexed by `accessed_at` for sorted retrieval |
| `editor_queries` | Editor query state per project/connection | Simple key-value: key is projectId or `connection:{id}` |
| `app_state` | Singleton app state (selectedProject, etc.) | Key-value for arbitrary app state. `selectedProject` stores project ID only |

Plus `schema_version` table for tracking migration versions.

### 1.2 Extend `createTables()` in MainDatabaseService
**File:** `src/main/services/mainDatabase.service.ts`

Add `CREATE TABLE IF NOT EXISTS` SQL for all new tables in the existing `createTables()` method. Add corresponding index creation. This is idempotent — safe on existing installs.

### 1.3 Create `AppDataRepository`
**File:** `src/main/services/appData.repository.ts` (new)

Static class providing typed CRUD methods for all new tables, using the existing Drizzle instance from MainDatabaseService. Key methods:

```
// Projects: getAllProjects(), getProjectById(), upsertProject(), deleteProject()
// Connections: getAllConnections(), getConnectionById(), upsertConnection(), deleteConnection()
// Settings: loadSettings(), saveAllSettings(), saveSetting()
// App State: getAppState(), setAppState(), getSelectedProjectId(), setSelectedProjectId()
// Editor Queries: getEditorQuery(), setEditorQuery()
// Saved Queries: getSavedQueriesByConnection(), upsertSavedQuery(), deleteSavedQuery()
// Cloud Sources: getAllCloudSources(), upsertCloudSource(), deleteCloudSource()
// Recent Items: getRecentItems(), addRecentItem(), removeRecentItem(), clearRecentItems()
```

### 1.4 Create `DatabaseBackupService`
**File:** `src/main/services/databaseBackup.service.ts` (new)

- `createBackup()` — uses SQLite `VACUUM INTO` for a consistent point-in-time snapshot
- Backup location: `{userData}/backups/main-database-{ISO-timestamp}.db`
- Keeps last 5 backups, prunes older ones
- `restoreFromBackup(path)` — emergency restore (close DB, copy backup over, reopen)

---

## Phase 2: Migration (database.json → SQLite)

### 2.1 Create `JsonToSqliteMigration` service
**File:** `src/main/services/jsonToSqliteMigration.service.ts` (new)

**Crash-safe migration flow:**
1. Check if `database.json` exists
2. Check if `app_state` has `json_migration_completed = 'true'` → skip if yes
3. Read `database.json` into memory
4. **Begin SQLite transaction**
5. Insert all data into new tables (projects, connections, settings as k/v pairs, saved_queries flattened, cloud_sources, recent_items, editor_queries, app_state for selectedProject)
6. Apply BigQuery keyfile patching (same logic as current `updateDatabase`)
7. Set `app_state('json_migration_completed', 'true')`
8. **Commit transaction**
9. Rename `database.json` → `database.json.migrated`

**Crash safety:** If crash occurs during steps 4-8, transaction rolls back, retry on next launch. If crash after step 8 but before step 9, the flag prevents re-migration.

### 2.2 Integrate into startup
**File:** `src/main/utils/setupHelpers.ts`

Update `initializeDataStorage()`:
```
1. Create DATA_DIR if missing
2. Initialize SQLite (MainDatabaseService.initializeDatabase()) — creates new tables
3. Create backup (DatabaseBackupService.createBackup())
4. Run JSON→SQLite migration if needed (JsonToSqliteMigration.migrateIfNeeded())
5. Only create database.json if migration hasn't completed yet (backward compat)
```

---

## Phase 3: Service Migration (one at a time, testable independently)

### 3.1 Migrate `SettingsService`
**File:** `src/main/services/settings.service.ts`

| Before | After |
|--------|-------|
| `loadDatabaseFile() → db.settings` | `AppDataRepository.loadSettings()` merged with defaults |
| `updateDatabase('settings', settings)` | `AppDataRepository.saveAllSettings(settings)` |

### 3.2 Migrate `SavedQueriesService`
**File:** `src/main/services/savedQueries.service.ts`

| Before | After |
|--------|-------|
| `loadDatabaseFile() → db.savedQueries[connectionId]` | `AppDataRepository.getSavedQueriesByConnection(connectionId)` |
| `updateDatabase('savedQueries', {...})` | `AppDataRepository.upsertSavedQuery()` / `deleteSavedQuery()` |

### 3.3 Migrate `ProjectsService`
**File:** `src/main/services/projects.service.ts`

| Before | After |
|--------|-------|
| `loadDatabaseFile() → db.projects` | `AppDataRepository.getAllProjects()` |
| `updateDatabase('projects', projects)` | Individual `upsertProject()` / `deleteProject()` |
| `loadDatabaseFile() → db.selectedProject` | `AppDataRepository.getSelectedProjectId()` + `getProjectById()` |
| `updateDatabase('queries', queries)` | `AppDataRepository.setEditorQuery(key, value)` |

The `loadProjects()` join pattern is preserved — projects are enriched with connection data at read time.

### 3.4 Migrate `ConnectorsService`
**File:** `src/main/services/connectors.service.ts` (largest, do last)

| Before | After |
|--------|-------|
| `loadDatabaseFile() → db.connections` | `AppDataRepository.getAllConnections()` |
| `updateDatabase('connections', [...])` | `upsertConnection()` / `deleteConnection()` |
| `loadDatabaseFile() → db.sources` | `AppDataRepository.getAllCloudSources()` |
| `loadDatabaseFile() → db.recentItems` | `AppDataRepository.getRecentItems()` |
| `loadDatabaseFile() → db.queries` | `AppDataRepository.getEditorQuery()` |

### 3.5 Update `resetFactorySettings()`
**File:** `src/main/services/settings.service.ts`

Must now clear both SQLite tables AND delete the old `database.json.migrated` if present.

---

## Phase 4: Cleanup

### 4.1 Remove JSON database code
- **`fileHelper.ts`**: Remove `loadDatabaseFile()`, `updateDatabase()`, the mutex, and `DB_FILE` import
- **`setupHelpers.ts`**: Remove `database.json` creation, keep `DB_FILE` only for migration detection
- **`backend.ts`**: Mark `DataBase` type as `@deprecated` (keep for migration code reference)

---

## Critical Files to Modify

| File | Action |
|------|--------|
| `src/main/schemas/mainDatabase.schema.ts` | Add 8+ new table definitions |
| `src/main/services/mainDatabase.service.ts` | Extend `createTables()` with new table SQL |
| `src/main/services/appData.repository.ts` | **NEW** — CRUD repository for all app data |
| `src/main/services/databaseBackup.service.ts` | **NEW** — Backup/restore service |
| `src/main/services/jsonToSqliteMigration.service.ts` | **NEW** — One-time migration |
| `src/main/utils/setupHelpers.ts` | Update startup sequence |
| `src/main/utils/fileHelper.ts` | Remove JSON database functions |
| `src/main/services/settings.service.ts` | Replace JSON calls with repository |
| `src/main/services/savedQueries.service.ts` | Replace JSON calls with repository |
| `src/main/services/projects.service.ts` | Replace JSON calls with repository |
| `src/main/services/connectors.service.ts` | Replace JSON calls with repository |

## Existing Code to Reuse

- **Drizzle ORM instance** from `MainDatabaseService.getDatabase()` — `src/main/services/mainDatabase.service.ts`
- **SQLite pragma configuration** (WAL, NORMAL sync, FK) — already set in `initializeDatabase()`
- **`createTables()` pattern** — existing manual SQL approach, extend it
- **`ensureSchemaUpToDate()` pattern** — for future column additions
- **BigQuery keyfile patching logic** — `fileHelper.ts:116-130`, must be replicated in migration
- **`loadDefaultSettings()`** — `fileHelper.ts:58-80`, continues to provide defaults for settings merge

---

## Verification Plan

1. **Pre-migration:** Manually inspect a real `database.json` file, note all project/connection/settings values
2. **Post-migration:** Query each SQLite table, verify all values match the original JSON
3. **Backup test:** Verify backup file is created in `{userData}/backups/` on app start, and old backups are pruned
4. **Crash test:** Kill app during migration (simulate with a debugger breakpoint), restart, verify migration completes correctly
5. **Functional test:** Walk through all app features that use the migrated data:
   - Create/edit/delete projects
   - Create/edit/delete connections (including BigQuery with keyfile)
   - Change settings
   - Save/edit/delete queries
   - Add/remove cloud sources
   - Recent items list
   - Factory reset
6. **Rollback test:** Rename `database.json.migrated` back to `database.json`, delete migration flag from `app_state`, restart — verify re-migration works
