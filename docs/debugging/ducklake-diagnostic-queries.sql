-- DuckLake Diagnostic Queries
-- Run these queries in the SQL editor when connected to a DuckLake instance
-- to diagnose schema extraction issues

-- ============================================================================
-- 1. List all attached databases
-- ============================================================================
SELECT database_name, internal
FROM duckdb_databases()
ORDER BY database_name;

-- Expected: You should see your DuckLake catalog database (e.g., dbtstudio_getting_started)
-- and a metadata database (e.g., __ducklake_metadata_<id>)


-- ============================================================================
-- 2. Find the metadata database
-- ============================================================================
SELECT database_name
FROM duckdb_databases()
WHERE database_name LIKE '__ducklake_metadata_%';

-- Expected: Should return one row with the metadata database name


-- ============================================================================
-- 3. Check current snapshot (REPLACE <metadata_db> with actual name from query #2)
-- ============================================================================
SELECT MAX(snapshot_id) as current_snapshot_id, COUNT(*) as total_snapshots
FROM "__ducklake_metadata_<id>".main.ducklake_snapshot;

-- Example: FROM "__ducklake_metadata_test".main.ducklake_snapshot;
-- Expected: Should return the current snapshot ID (e.g., 5) and total count


-- ============================================================================
-- 4. List all snapshots (REPLACE <metadata_db> with actual name)
-- ============================================================================
SELECT snapshot_id, snapshot_time, schema_version, next_catalog_id, next_file_id
FROM "__ducklake_metadata_<id>".main.ducklake_snapshot
ORDER BY snapshot_id DESC
LIMIT 10;

-- Expected: Should show recent snapshots with their IDs and timestamps


-- ============================================================================
-- 5. Check schemas in the metadata catalog (REPLACE <metadata_db>)
-- ============================================================================
SELECT schema_id, schema_uuid, schema_name, begin_snapshot, end_snapshot
FROM "__ducklake_metadata_<id>".main.ducklake_schema
ORDER BY schema_id;

-- Expected: Should show schemas like 'main' with their validity ranges
-- If schema_name is NULL, this is the root cause of the issue


-- ============================================================================
-- 6. Test the schema extraction query (REPLACE <metadata_db>)
-- ============================================================================
WITH current_snapshot AS (
  SELECT COALESCE(MAX(snapshot_id), 0) as snapshot_id
  FROM "__ducklake_metadata_<id>".main.ducklake_snapshot
)
SELECT DISTINCT s.schema_name, s.schema_id, s.begin_snapshot, s.end_snapshot, cs.snapshot_id as current_snapshot
FROM "__ducklake_metadata_<id>".main.ducklake_schema s
CROSS JOIN current_snapshot cs
WHERE cs.snapshot_id >= s.begin_snapshot
  AND (cs.snapshot_id < s.end_snapshot OR s.end_snapshot IS NULL)
ORDER BY s.schema_name;

-- Expected: Should return schema names (e.g., 'main')
-- If schema_name is NULL or undefined, check query #5


-- ============================================================================
-- 7. List all tables (REPLACE <metadata_db>)
-- ============================================================================
SELECT table_id, table_uuid, table_name, schema_id, begin_snapshot, end_snapshot
FROM "__ducklake_metadata_<id>".main.ducklake_table
ORDER BY table_id;

-- Expected: Should show all tables with their schema_id references


-- ============================================================================
-- 8. List tables with schema names (REPLACE <metadata_db>)
-- ============================================================================
WITH current_snapshot AS (
  SELECT COALESCE(MAX(snapshot_id), 0) as snapshot_id
  FROM "__ducklake_metadata_<id>".main.ducklake_snapshot
)
SELECT
  t.table_name,
  s.schema_name,
  t.table_id,
  t.schema_id,
  t.begin_snapshot,
  t.end_snapshot,
  cs.snapshot_id as current_snapshot
FROM "__ducklake_metadata_<id>".main.ducklake_table t
JOIN "__ducklake_metadata_<id>".main.ducklake_schema s ON t.schema_id = s.schema_id
CROSS JOIN current_snapshot cs
WHERE cs.snapshot_id >= t.begin_snapshot
  AND (cs.snapshot_id < t.end_snapshot OR t.end_snapshot IS NULL)
  AND cs.snapshot_id >= s.begin_snapshot
  AND (cs.snapshot_id < s.end_snapshot OR s.end_snapshot IS NULL)
ORDER BY s.schema_name, t.table_name;

-- Expected: Should list all active tables with their schema names


-- ============================================================================
-- 9. Check columns for a specific table (REPLACE <metadata_db> and <table_name>)
-- ============================================================================
WITH current_snapshot AS (
  SELECT COALESCE(MAX(snapshot_id), 0) as snapshot_id
  FROM "__ducklake_metadata_<id>".main.ducklake_snapshot
)
SELECT
  c.column_id,
  c.column_name,
  c.column_type,
  c.column_order,
  c.begin_snapshot,
  c.end_snapshot,
  t.table_name
FROM "__ducklake_metadata_<id>".main.ducklake_column c
JOIN "__ducklake_metadata_<id>".main.ducklake_table t ON c.table_id = t.table_id
CROSS JOIN current_snapshot cs
WHERE t.table_name = 'links'
  AND cs.snapshot_id >= c.begin_snapshot
  AND (cs.snapshot_id < c.end_snapshot OR c.end_snapshot IS NULL)
  AND cs.snapshot_id >= t.begin_snapshot
  AND (cs.snapshot_id < t.end_snapshot OR t.end_snapshot IS NULL)
ORDER BY c.column_order;

-- Expected: Should show all columns for the specified table


-- ============================================================================
-- 10. Full schema extraction test (REPLACE <metadata_db> and <schema_name>)
-- ============================================================================
WITH current_snapshot AS (
  SELECT COALESCE(MAX(snapshot_id), 0) as snapshot_id
  FROM "__ducklake_metadata_<id>".main.ducklake_snapshot
)
SELECT
  t.table_name,
  c.column_name,
  c.column_type,
  c.column_order
FROM "__ducklake_metadata_<id>".main.ducklake_table t
JOIN "__ducklake_metadata_<id>".main.ducklake_schema s ON t.schema_id = s.schema_id
LEFT JOIN "__ducklake_metadata_<id>".main.ducklake_column c ON t.table_id = c.table_id
CROSS JOIN current_snapshot cs
WHERE s.schema_name = 'main'
  AND cs.snapshot_id >= t.begin_snapshot
  AND (cs.snapshot_id < t.end_snapshot OR t.end_snapshot IS NULL)
  AND cs.snapshot_id >= s.begin_snapshot
  AND (cs.snapshot_id < s.end_snapshot OR s.end_snapshot IS NULL)
  AND (c.column_id IS NULL OR (cs.snapshot_id >= c.begin_snapshot AND (cs.snapshot_id < c.end_snapshot OR c.end_snapshot IS NULL)))
ORDER BY t.table_name, c.column_order;

-- Expected: Should return all tables and their columns for the specified schema


-- ============================================================================
-- TROUBLESHOOTING TIPS
-- ============================================================================
--
-- Issue: schema_name returns NULL or undefined
-- Solution: Check query #5 - if schema_name is NULL in ducklake_schema table,
--           the DuckLake catalog may be corrupted or improperly initialized
--
-- Issue: No rows returned from query #6
-- Solution: Check query #3 and #5 - ensure current_snapshot is not 0 and that
--           begin_snapshot values are less than or equal to current_snapshot
--
-- Issue: Tables exist but query #8 returns empty
-- Solution: Check that schema_id in ducklake_table matches schema_id in
--           ducklake_schema, and that snapshot ranges are valid
--
-- Issue: "Table does not exist" errors
-- Solution: Replace <metadata_db> with the actual database name from query #2
--           Make sure to include quotes if the name contains special characters
--
-- ============================================================================
