"""End-to-end verification for the local PyIceberg SQLite catalog."""

import importlib.util
import tempfile
import unittest
from pathlib import Path

from pyiceberg.catalog import load_catalog
from pyiceberg.schema import Schema
from pyiceberg.types import LongType, NestedField, StringType


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


if __name__ == "__main__":
    unittest.main()
