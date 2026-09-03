"""End-to-end verification for the local PyIceberg SQLite catalog."""

import csv as csv_module
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

try:
    import pyarrow  # noqa: F401
    from pyiceberg.catalog import load_catalog
    from pyiceberg.schema import Schema
    from pyiceberg.types import LongType, NestedField, StringType
except ImportError as exc:
    raise unittest.SkipTest(f"Optional Iceberg test dependencies unavailable: {exc}") from exc


BRIDGE_PATH = (
    Path(__file__).resolve().parents[2] / "resources" / "python" / "iceberg_bridge.py"
)
SPEC = importlib.util.spec_from_file_location("iceberg_bridge", BRIDGE_PATH)
assert SPEC and SPEC.loader
ICEBERG_BRIDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ICEBERG_BRIDGE)


class LocalCatalogBridgeTest(unittest.TestCase):
    def test_create_reload_and_list_namespace_and_table(self) -> None:
        with tempfile.TemporaryDirectory() as catalog_directory:
            created = ICEBERG_BRIDGE.handle_create_metadata_file(
                {"warehouse_path": catalog_directory}
            )
            self.assertTrue(created["ok"])
            self.assertEqual(created["namespaces"], [["default"]])

            properties = {
                "type": "sql",
                "uri": f"sqlite:///{created['metadata_path']}",
                "warehouse": Path(created["warehouse_path"]).as_uri(),
            }
            catalog = load_catalog("local", **properties)
            catalog.create_table(
                ("default", "generated_data"),
                schema=Schema(
                    NestedField(1, "id", LongType(), required=True),
                    NestedField(2, "name", StringType(), required=False),
                ),
            )
            catalog.close()

            namespaces = ICEBERG_BRIDGE.handle_list_namespaces(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                }
            )
            tables = ICEBERG_BRIDGE.handle_list_tables(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                }
            )

            self.assertEqual(namespaces, {"ok": True, "namespaces": [["default"]]})
            self.assertEqual(tables, {"ok": True, "tables": ["generated_data"]})

    def test_import_table_from_csv_creates_and_appends(self) -> None:
        """Importing a local CSV creates a table and appends its rows."""
        with tempfile.TemporaryDirectory() as catalog_directory:
            created = ICEBERG_BRIDGE.handle_create_metadata_file(
                {"warehouse_path": catalog_directory}
            )
            self.assertTrue(created["ok"])

            source = Path(catalog_directory) / "source.csv"
            with source.open("w", newline="", encoding="utf-8") as handle:
                writer = csv_module.writer(handle)
                writer.writerow(["id", "name"])
                writer.writerow(["1", "alpha"])
                writer.writerow(["2", "beta"])
                writer.writerow(["3", "gamma"])

            properties = {
                "type": "sql",
                "uri": f"sqlite:///{created['metadata_path']}",
                "warehouse": Path(created["warehouse_path"]).as_uri(),
            }
            imported = ICEBERG_BRIDGE.handle_import_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "imported_csv",
                    "file_path": str(source),
                    "file_format": "csv",
                }
            )
            self.assertTrue(imported["ok"], imported.get("error"))
            self.assertEqual(imported["row_count"], 3)
            self.assertEqual(imported["table"], "imported_csv")
            self.assertEqual(imported["namespace"], ["default"])

            tables = ICEBERG_BRIDGE.handle_list_tables(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                }
            )
            self.assertIn("imported_csv", tables["tables"])

            snapshots = ICEBERG_BRIDGE.handle_get_snapshots(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "imported_csv",
                }
            )
            self.assertTrue(snapshots["ok"])
            self.assertEqual(len(snapshots["snapshots"]), 1)

    def test_import_table_from_json_and_parquet(self) -> None:
        """JSON and Parquet sources import with the same persisted contract."""
        with tempfile.TemporaryDirectory() as catalog_directory:
            created = ICEBERG_BRIDGE.handle_create_metadata_file(
                {"warehouse_path": catalog_directory}
            )
            self.assertTrue(created["ok"])

            properties = {
                "type": "sql",
                "uri": f"sqlite:///{created['metadata_path']}",
                "warehouse": Path(created["warehouse_path"]).as_uri(),
            }

            json_source = Path(catalog_directory) / "source.json"
            # PyArrow's JSON reader expects newline-delimited JSON records.
            json_source.write_text(
                "\n".join(
                    json.dumps(record)
                    for record in [
                        {"id": 1, "name": "alpha"},
                        {"id": 2, "name": "beta"},
                    ]
                ),
                encoding="utf-8",
            )
            imported_json = ICEBERG_BRIDGE.handle_import_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "imported_json",
                    "file_path": str(json_source),
                    "file_format": "json",
                }
            )
            self.assertTrue(imported_json["ok"], imported_json.get("error"))
            self.assertEqual(imported_json["row_count"], 2)

            json_array_source = Path(catalog_directory) / "array.json"
            json_array_source.write_text(
                json.dumps(
                    [
                        {"id": 3, "name": "delta"},
                        {"id": 4, "name": "epsilon"},
                    ]
                ),
                encoding="utf-8",
            )
            imported_json_array = ICEBERG_BRIDGE.handle_import_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "imported_json_array",
                    "file_path": str(json_array_source),
                    "file_format": "json",
                }
            )
            self.assertTrue(
                imported_json_array["ok"], imported_json_array.get("error")
            )
            self.assertEqual(imported_json_array["row_count"], 2)

            parquet_source = Path(catalog_directory) / "source.parquet"
            import pyarrow as pa
            import pyarrow.parquet as pa_parquet

            pa_parquet.write_table(
                pa.table(
                    {
                        "id": [1, 2, 3],
                        "name": ["x", "y", "z"],
                    }
                ),
                parquet_source,
            )
            imported_parquet = ICEBERG_BRIDGE.handle_import_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "imported_parquet",
                    "file_path": str(parquet_source),
                    "file_format": "parquet",
                }
            )
            self.assertTrue(
                imported_parquet["ok"], imported_parquet.get("error")
            )
            self.assertEqual(imported_parquet["row_count"], 3)

            preview = ICEBERG_BRIDGE.handle_preview_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "imported_parquet",
                    "limit": 10,
                }
            )
            self.assertTrue(preview["ok"])
            self.assertEqual(preview["total"], 3)

    def test_import_table_rejects_existing_table_and_missing_file(self) -> None:
        """Existing tables and missing files fail with clean errors."""
        with tempfile.TemporaryDirectory() as catalog_directory:
            created = ICEBERG_BRIDGE.handle_create_metadata_file(
                {"warehouse_path": catalog_directory}
            )
            self.assertTrue(created["ok"])

            properties = {
                "type": "sql",
                "uri": f"sqlite:///{created['metadata_path']}",
                "warehouse": Path(created["warehouse_path"]).as_uri(),
            }

            source = Path(catalog_directory) / "source.csv"
            source.write_text("id,name\n1,alpha\n", encoding="utf-8")

            first = ICEBERG_BRIDGE.handle_import_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "dup_table",
                    "file_path": str(source),
                    "file_format": "csv",
                }
            )
            self.assertTrue(first["ok"])

            duplicate = ICEBERG_BRIDGE.handle_import_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "dup_table",
                    "file_path": str(source),
                    "file_format": "csv",
                }
            )
            self.assertFalse(duplicate["ok"])
            self.assertIn("already exists", duplicate["error"].lower())

            missing = ICEBERG_BRIDGE.handle_import_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "missing_table",
                    "file_path": str(Path(catalog_directory) / "nope.csv"),
                    "file_format": "csv",
                }
            )
            self.assertFalse(missing["ok"])
            self.assertIn("file not found", missing["error"].lower())

    def test_drop_and_rename_table(self) -> None:
        """Drop and rename operations update the persisted catalog contract."""
        with tempfile.TemporaryDirectory() as catalog_directory:
            created = ICEBERG_BRIDGE.handle_create_metadata_file(
                {"warehouse_path": catalog_directory}
            )
            self.assertTrue(created["ok"])

            properties = {
                "type": "sql",
                "uri": f"sqlite:///{created['metadata_path']}",
                "warehouse": Path(created["warehouse_path"]).as_uri(),
            }
            source = Path(catalog_directory) / "source.csv"
            source.write_text("id,name\n1,alpha\n", encoding="utf-8")

            imported = ICEBERG_BRIDGE.handle_import_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "old_name",
                    "file_path": str(source),
                    "file_format": "csv",
                }
            )
            self.assertTrue(imported["ok"])

            renamed = ICEBERG_BRIDGE.handle_rename_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "old_name",
                    "new_table": "new_name",
                }
            )
            self.assertTrue(renamed["ok"], renamed.get("error"))
            self.assertEqual(renamed["table"], "new_name")

            tables_after_rename = ICEBERG_BRIDGE.handle_list_tables(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                }
            )
            self.assertIn("new_name", tables_after_rename["tables"])
            self.assertNotIn("old_name", tables_after_rename["tables"])

            dropped = ICEBERG_BRIDGE.handle_drop_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "new_name",
                }
            )
            self.assertTrue(dropped["ok"], dropped.get("error"))

            tables_after_drop = ICEBERG_BRIDGE.handle_list_tables(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                }
            )
            self.assertEqual(tables_after_drop["tables"], [])

    def test_create_and_drop_namespace_lifecycle(self) -> None:
        """Namespaces can be created (nested), listed, and dropped when empty."""
        with tempfile.TemporaryDirectory() as catalog_directory:
            created = ICEBERG_BRIDGE.handle_create_metadata_file(
                {"warehouse_path": catalog_directory}
            )
            self.assertTrue(created["ok"])

            properties = {
                "type": "sql",
                "uri": f"sqlite:///{created['metadata_path']}",
                "warehouse": Path(created["warehouse_path"]).as_uri(),
            }

            created_ns = ICEBERG_BRIDGE.handle_create_namespace(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["analytics", "daily"],
                }
            )
            self.assertTrue(created_ns["ok"], created_ns.get("error"))
            self.assertEqual(created_ns["namespace"], ["analytics", "daily"])

            namespaces = ICEBERG_BRIDGE.handle_list_namespaces(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                }
            )
            self.assertTrue(namespaces["ok"])
            self.assertIn(["analytics"], namespaces["namespaces"])

            nested = ICEBERG_BRIDGE.handle_list_namespaces(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "parent": ["analytics"],
                }
            )
            self.assertTrue(nested["ok"])
            self.assertIn(["analytics", "daily"], nested["namespaces"])

            duplicate = ICEBERG_BRIDGE.handle_create_namespace(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["analytics", "daily"],
                }
            )
            self.assertFalse(duplicate["ok"])
            self.assertIn("already exists", duplicate["error"].lower())

            missing = ICEBERG_BRIDGE.handle_drop_namespace(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["does_not_exist"],
                }
            )
            self.assertFalse(missing["ok"])

            # A namespace containing a table cannot be dropped.
            source = Path(catalog_directory) / "source.csv"
            source.write_text("id,name\n1,alpha\n", encoding="utf-8")
            imported = ICEBERG_BRIDGE.handle_import_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["analytics", "daily"],
                    "table": "events",
                    "file_path": str(source),
                    "file_format": "csv",
                }
            )
            self.assertTrue(imported["ok"], imported.get("error"))

            non_empty = ICEBERG_BRIDGE.handle_drop_namespace(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["analytics", "daily"],
                }
            )
            self.assertFalse(non_empty["ok"])

            dropped_table = ICEBERG_BRIDGE.handle_drop_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["analytics", "daily"],
                    "table": "events",
                }
            )
            self.assertTrue(dropped_table["ok"])

            dropped_ns = ICEBERG_BRIDGE.handle_drop_namespace(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["analytics", "daily"],
                }
            )
            self.assertTrue(dropped_ns["ok"], dropped_ns.get("error"))

            namespaces_after = ICEBERG_BRIDGE.handle_list_namespaces(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                }
            )
            self.assertTrue(namespaces_after["ok"])
            # Dropping the empty nested namespace also removes its now-empty
            # parent in the SQL catalog.
            self.assertNotIn(["analytics"], namespaces_after["namespaces"])

    def test_drop_and_rename_reject_missing_tables(self) -> None:
        """Dropping or renaming a non-existent table returns a clean error."""
        with tempfile.TemporaryDirectory() as catalog_directory:
            created = ICEBERG_BRIDGE.handle_create_metadata_file(
                {"warehouse_path": catalog_directory}
            )
            self.assertTrue(created["ok"])

            properties = {
                "type": "sql",
                "uri": f"sqlite:///{created['metadata_path']}",
                "warehouse": Path(created["warehouse_path"]).as_uri(),
            }

            dropped = ICEBERG_BRIDGE.handle_drop_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "ghost",
                }
            )
            self.assertFalse(dropped["ok"])

            renamed = ICEBERG_BRIDGE.handle_rename_table(
                {
                    "catalog_name": "local",
                    "catalog_properties": properties,
                    "namespace": ["default"],
                    "table": "ghost",
                    "new_table": "also_ghost",
                }
            )
            self.assertFalse(renamed["ok"])


if __name__ == "__main__":
    unittest.main()
