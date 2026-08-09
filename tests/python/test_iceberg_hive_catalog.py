"""Opt-in persisted-table acceptance test for the Hive Metastore catalog."""

import os
import unittest

import pyarrow as pa
from pyiceberg.catalog import load_catalog
from pyiceberg.schema import Schema
from pyiceberg.types import DoubleType, LongType, NestedField, StringType


@unittest.skipUnless(
    os.environ.get("ICEBERG_HIVE_ACCEPTANCE") == "1",
    "Hive catalog acceptance is opt-in",
)
class HiveCatalogAcceptanceTest(unittest.TestCase):
    namespace = ("dbt_studio_hive_acceptance",)
    table_identifier = (*namespace, "sales")

    def catalog_properties(self) -> dict[str, str]:
        return {
            "type": "hive",
            "uri": os.environ["ICEBERG_HIVE_URI"],
            "warehouse": os.environ["ICEBERG_HIVE_WAREHOUSE"],
        }

    def test_create_close_reload_and_inspect_three_rows(self) -> None:
        properties = self.catalog_properties()
        catalog = load_catalog("hive_acceptance", **properties)
        if self.namespace not in catalog.list_namespaces():
            catalog.create_namespace(
                self.namespace,
                {"location": properties["warehouse"]},
            )

        if self.table_identifier not in catalog.list_tables(self.namespace):
            table = catalog.create_table(
                self.table_identifier,
                schema=Schema(
                    NestedField(1, "sale_id", LongType(), required=False),
                    NestedField(2, "product", StringType(), required=False),
                    NestedField(3, "amount", DoubleType(), required=False),
                ),
            )
            table.append(
                pa.table(
                    {
                        "sale_id": pa.array([1, 2, 3], type=pa.int64()),
                        "product": ["Starter", "Analytics", "Enterprise"],
                        "amount": pa.array(
                            [49.0, 129.5, 399.0],
                            type=pa.float64(),
                        ),
                    }
                )
            )
        catalog.close()

        reloaded = load_catalog("hive_acceptance_reload", **properties)
        self.assertIn(self.namespace, reloaded.list_namespaces())
        self.assertIn(
            self.table_identifier,
            reloaded.list_tables(self.namespace),
        )
        table = reloaded.load_table(self.table_identifier)
        self.assertEqual(table.scan().count(), 3)
        self.assertEqual(
            [field.name for field in table.schema().fields],
            ["sale_id", "product", "amount"],
        )
        self.assertTrue(list(table.snapshots()))
        self.assertIsInstance(table.properties, dict)
        self.assertIsNotNone(next(iter(table.scan(limit=1).plan_files()), None))
        reloaded.close()


if __name__ == "__main__":
    unittest.main()
