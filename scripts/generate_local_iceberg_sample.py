#!/usr/bin/env python3
"""Generate sample data in a DBT Studio local Iceberg catalog."""

import argparse
from pathlib import Path

import pyarrow as pa
from pyiceberg.catalog import load_catalog


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "catalog_directory",
        help="Folder selected in the DBT Studio Local (SQLite catalog) picker",
    )
    args = parser.parse_args()

    catalog_directory = Path(args.catalog_directory).expanduser().resolve()
    catalog_path = catalog_directory / "pyiceberg_catalog.db"
    warehouse_path = catalog_directory / "warehouse"
    if not catalog_path.is_file():
        raise SystemExit(
            f"Catalog database not found: {catalog_path}. Initialize it in DBT Studio first."
        )

    catalog = load_catalog(
        "local",
        **{
            "type": "sql",
            "uri": f"sqlite:///{catalog_path.as_posix()}",
            "warehouse": warehouse_path.as_uri(),
        },
    )
    catalog.create_namespace_if_not_exists("default")
    sample = pa.table(
        {
            "id": pa.array([1, 2, 3], type=pa.int64()),
            "name": pa.array(["alpha", "beta", "gamma"], type=pa.string()),
        }
    )
    table = catalog.create_table_if_not_exists(
        ("default", "generated_data"),
        schema=sample.schema,
    )
    table.append(sample)
    rows = table.scan().to_arrow().to_pylist()
    catalog.close()

    print(f"Catalog: {catalog_path}")
    print("Table: default.generated_data")
    print(f"Rows: {rows}")


if __name__ == "__main__":
    main()
