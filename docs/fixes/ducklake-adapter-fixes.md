# DuckLake Adapter Fixes: Parameter Binding, Schema Compatibility, and HugeInt Support

## Overview
This document details the comprehensive fixes applied to all DuckLake catalog adapters (DuckDB, PostgreSQL, SQLite) to resolve runtime errors, schema mismatches, and data type rendering issues.

## 1. Parameter Binding Fix
**Issue:** The DuckDB Node API (`@duckdb/node-api` v1.3.0-alpha.21) failed to bind parameters correctly when using `?` placeholders, causing "Failed to retrieve bind parameter index" errors.

**Fix:** Replaced all parameterized queries with string interpolation across all adapters.
- **Internal Values:** Numeric IDs are interpolated directly.
- **User Input:** String values (like table names) are sanitized by escaping single quotes (`.replace(/'/g, "''")`) to prevent SQL injection.

**Applied to:**
- `DuckDBCatalogAdapter`
- `PostgreSQLCatalogAdapter`
- `SQLiteCatalogAdapter`

## 2. Schema Compatibility Fix
**Issue:** The deployed DuckLake metadata database schema was missing several columns that were present in the code's queries (based on a newer specification), causing "Column not found" errors.

**Fix:** Removed references to non-existent columns from all queries.

**Removed Columns:**
- `ducklake_table_column_stats`: `extra_stats`
- `ducklake_data_file`: `mapping_id`, `encryption_key`, `partial_file_info`
- `ducklake_snapshot_changes`: `author`, `commit_message`, `commit_extra_info`

**Applied to:**
- `DuckDBCatalogAdapter`
- `PostgreSQLCatalogAdapter`
- `SQLiteCatalogAdapter`

## 3. HugeInt Data Type Support
**Issue:** DuckDB returns large integers as `{ hugeint: ... }` objects instead of primitive numbers. React failed to render these objects, causing application crashes ("Objects are not valid as a React child").

**Fix:**
1. **Adapter Layer:** Added a recursive `convertHugeInts()` helper function to all adapters' `getTableDetails` method. This function traverses the entire response object and converts any `{ hugeint: ... }` objects into JavaScript numbers.
2. **Utility Layer:** Updated `normalizeNumericValue` in `src/renderer/utils/fileUtils.ts` to handle hugeint objects safely.
3. **Component Layer:** Added `safeToString()` helper in `DuckLakeTableDetails.tsx` as a final safety net.

**Applied to:**
- `DuckDBCatalogAdapter`
- `PostgreSQLCatalogAdapter`
- `SQLiteCatalogAdapter`
- `src/renderer/utils/fileUtils.ts`
- `src/renderer/components/duckLake/DuckLakeTableDetails.tsx`

## 4. Feature Parity: SQLite Adapter
**Issue:** The `SQLiteCatalogAdapter` was missing the `getTableDetails` method entirely.

**Fix:** Ported the full `getTableDetails` implementation (with all the above fixes) to the SQLite adapter.

## Summary of Files Modified
- `src/main/services/duckLake/adapters/duckdb.adapter.ts`
- `src/main/services/duckLake/adapters/postgresql.adapter.ts`
- `src/main/services/duckLake/adapters/sqlite.adapter.ts`
- `src/renderer/utils/fileUtils.ts`
- `src/renderer/components/duckLake/DuckLakeTableDetails.tsx`

## Testing
All three adapters now support:
- Viewing table details without errors
- Correctly rendering large integer values
- Working with the current deployed DuckLake schema
