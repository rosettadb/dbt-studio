"""Opt-in persisted-table acceptance test for REST/Polaris catalogs.

Run with ICEBERG_REST_ACCEPTANCE=1 and the catalog environment variables below.
Secrets are read only from the environment and never written to test output.
"""

import os
import unittest

import pyarrow as pa
from pyiceberg.catalog import load_catalog
from pyiceberg.schema import Schema
from pyiceberg.types import LongType, NestedField, StringType


@unittest.skipUnless(
    os.environ.get("ICEBERG_REST_ACCEPTANCE") == "1",
    "REST catalog acceptance is opt-in",
)
class RestCatalogAcceptanceTest(unittest.TestCase):
    namespace = ("dbt_studio_acceptance",)
    table_identifier = ("dbt_studio_acceptance", "customers")

    def catalog_properties(self) -> dict[str, str]:
        properties = {
            "type": "rest",
            "uri": os.environ["ICEBERG_REST_URI"],
        }
        if warehouse := os.environ.get("ICEBERG_REST_WAREHOUSE"):
            properties["warehouse"] = warehouse
        if credential := os.environ.get("ICEBERG_REST_CREDENTIAL"):
            properties["credential"] = credential
        if oauth_uri := os.environ.get("ICEBERG_REST_OAUTH_URI"):
            properties["oauth2-server-uri"] = oauth_uri
        if scope := os.environ.get("ICEBERG_REST_SCOPE"):
            properties["scope"] = scope
        if delegation := os.environ.get("ICEBERG_REST_ACCESS_DELEGATION"):
            properties["header.X-Iceberg-Access-Delegation"] = delegation
        if s3_endpoint := os.environ.get("ICEBERG_S3_ENDPOINT"):
            properties["s3.endpoint"] = s3_endpoint
            properties["s3.region"] = os.environ.get("ICEBERG_S3_REGION", "us-east-1")
            properties["s3.access-key-id"] = os.environ["ICEBERG_S3_ACCESS_KEY_ID"]
            properties["s3.secret-access-key"] = os.environ[
                "ICEBERG_S3_SECRET_ACCESS_KEY"
            ]
            properties["s3.force-virtual-addressing"] = "false"
        return properties

    def test_create_close_reload_and_inspect_three_rows(self) -> None:
        catalog = load_catalog("acceptance", **self.catalog_properties())
        if self.namespace not in catalog.list_namespaces():
            catalog.create_namespace(self.namespace)

        if self.table_identifier not in catalog.list_tables(self.namespace):
            table = catalog.create_table(
                self.table_identifier,
                schema=Schema(
                    NestedField(1, "id", LongType(), required=False),
                    NestedField(2, "name", StringType(), required=False),
                ),
            )
        else:
            table = catalog.load_table(self.table_identifier)

        existing_rows = table.scan().to_arrow().to_pylist()
        if not existing_rows:
            table.append(
                pa.Table.from_arrays(
                    [
                        pa.array([1, 2, 3], type=pa.int64()),
                        pa.array(["Ada", "Linus", "Grace"]),
                    ],
                    schema=pa.schema(
                        [
                            pa.field("id", pa.int64(), nullable=False),
                            pa.field("name", pa.string(), nullable=True),
                        ]
                    ),
                )
            )
        else:
            self.assertEqual(
                existing_rows,
                [
                    {"id": 1, "name": "Ada"},
                    {"id": 2, "name": "Linus"},
                    {"id": 3, "name": "Grace"},
                ],
            )
        catalog.close()

        reloaded = load_catalog("acceptance", **self.catalog_properties())
        self.assertIn(self.namespace, reloaded.list_namespaces())
        self.assertIn(
            self.table_identifier,
            reloaded.list_tables(self.namespace),
        )

        table = reloaded.load_table(self.table_identifier)
        rows = table.scan().to_arrow().to_pylist()
        self.assertEqual(
            rows,
            [
                {"id": 1, "name": "Ada"},
                {"id": 2, "name": "Linus"},
                {"id": 3, "name": "Grace"},
            ],
        )
        self.assertEqual([field.name for field in table.schema().fields], ["id", "name"])
        self.assertTrue(list(table.snapshots()))
        self.assertIsInstance(table.properties, dict)
        self.assertIsNotNone(next(iter(table.scan(limit=1).plan_files()), None))
        reloaded.close()


if __name__ == "__main__":
    unittest.main()
