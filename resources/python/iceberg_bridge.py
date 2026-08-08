#!/usr/bin/env python3
"""
Iceberg Bridge Script — DBT Studio
Reads one JSON command from stdin, writes one JSON result to stdout.
All errors are returned as {"ok": false, "error": "..."} — never thrown to stderr.

Supported commands:
  install_check, test_connection, list_namespaces, list_tables,
  get_schema, get_snapshots, preview_table, create_metadata_file
"""

import json
import os
import sys


def resolve_env_vars(props: dict) -> dict:
    """Replace __ENV:VARNAME__ placeholders with actual environment variable values."""
    result = {}
    for k, v in props.items():
        if isinstance(v, str) and v.startswith("__ENV:"):
            env_key = v[6:]
            result[k] = os.environ.get(env_key, "")
        else:
            result[k] = v
    return result


def handle_install_check(_cmd: dict) -> dict:
    """Check the complete runtime profile required by the implemented catalogs."""
    try:
        import pyiceberg  # noqa: PLC0415
        import pyarrow  # noqa: F401, PLC0415
        import psycopg2  # noqa: F401, PLC0415
        import s3fs  # noqa: F401, PLC0415
        import sqlalchemy  # noqa: F401, PLC0415
        return {"ok": True, "installed": True, "version": pyiceberg.__version__}
    except ImportError:
        return {"ok": True, "installed": False}


def handle_test_connection(cmd: dict) -> dict:
    """Test that the catalog is reachable by listing its top-level namespaces."""
    try:
        from pyiceberg.catalog import load_catalog  # noqa: PLC0415
        props = resolve_env_vars(cmd.get("catalog_properties", {}))
        catalog = load_catalog(cmd["catalog_name"], **props)
        namespaces = catalog.list_namespaces()
        return {"ok": True, "namespace_count": len(namespaces)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def handle_list_namespaces(cmd: dict) -> dict:
    """List namespaces, optionally under a parent namespace."""
    try:
        from pyiceberg.catalog import load_catalog  # noqa: PLC0415
        props = resolve_env_vars(cmd.get("catalog_properties", {}))
        catalog = load_catalog(cmd["catalog_name"], **props)
        parent = tuple(cmd["parent"]) if cmd.get("parent") else ()
        namespaces = catalog.list_namespaces(parent)
        return {"ok": True, "namespaces": [list(ns) for ns in namespaces]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def handle_list_tables(cmd: dict) -> dict:
    """List tables within a given namespace."""
    try:
        from pyiceberg.catalog import load_catalog  # noqa: PLC0415
        props = resolve_env_vars(cmd.get("catalog_properties", {}))
        catalog = load_catalog(cmd["catalog_name"], **props)
        namespace = tuple(cmd["namespace"])
        identifiers = catalog.list_tables(namespace)
        # Each identifier is a tuple; return just the table name part
        return {"ok": True, "tables": [ident[-1] for ident in identifiers]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def handle_get_schema(cmd: dict) -> dict:
    """Return the current schema (field list) for a table."""
    try:
        from pyiceberg.catalog import load_catalog  # noqa: PLC0415
        props = resolve_env_vars(cmd.get("catalog_properties", {}))
        catalog = load_catalog(cmd["catalog_name"], **props)
        namespace = tuple(cmd["namespace"])
        table = catalog.load_table((*namespace, cmd["table"]))
        schema = table.schema()
        fields = []
        for field in schema.fields:
            fields.append({
                "fieldId": field.field_id,
                "name": field.name,
                "type": str(field.field_type),
                "required": field.required,
                "doc": field.doc,
            })
        return {"ok": True, "fields": fields}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def handle_get_snapshots(cmd: dict) -> dict:
    """Return the snapshot history for a table."""
    try:
        from pyiceberg.catalog import load_catalog  # noqa: PLC0415
        props = resolve_env_vars(cmd.get("catalog_properties", {}))
        catalog = load_catalog(cmd["catalog_name"], **props)
        namespace = tuple(cmd["namespace"])
        table = catalog.load_table((*namespace, cmd["table"]))
        snapshots = []
        for snap in table.metadata.snapshots:
            snapshots.append({
                "snapshotId": str(snap.snapshot_id),
                "parentId": str(snap.parent_snapshot_id) if snap.parent_snapshot_id else None,
                "operation": snap.summary.operation.value if snap.summary and snap.summary.operation else "unknown",
                "committedAt": str(snap.timestamp_ms),
                "manifestList": snap.manifest_list or "",
                "summary": dict(snap.summary.additional_properties) if snap.summary else {},
            })
        return {"ok": True, "snapshots": snapshots}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def handle_preview_table(cmd: dict) -> dict:
    """Preview rows from a table using PyArrow scan."""
    try:
        from pyiceberg.catalog import load_catalog  # noqa: PLC0415
        props = resolve_env_vars(cmd.get("catalog_properties", {}))
        catalog = load_catalog(cmd["catalog_name"], **props)
        namespace = tuple(cmd["namespace"])
        table = catalog.load_table((*namespace, cmd["table"]))
        limit = int(cmd.get("limit", 100))
        row_filter = cmd.get("row_filter")

        scan_kwargs = {"limit": limit}
        if row_filter:
            scan_kwargs["row_filter"] = row_filter

        arrow_table = table.scan(**scan_kwargs).to_arrow()
        columns = arrow_table.schema.names
        rows = arrow_table.to_pydict()
        # Convert column-oriented dict to row-oriented list of lists
        row_list = [
            [rows[col][i] for col in columns]
            for i in range(len(arrow_table))
        ]
        return {
            "ok": True,
            "columns": columns,
            "rows": row_list,
            "total": len(row_list),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def handle_create_metadata_file(cmd: dict) -> dict:
    """
    Initialize a development-only SQL catalog backed by SQLite.

    The IPC command keeps its historical name for compatibility. It creates a
    durable catalog database and local warehouse, then reloads the catalog to
    prove the persisted contract works.
    """
    try:
        from pathlib import Path  # noqa: PLC0415
        from pyiceberg.catalog import load_catalog  # noqa: PLC0415

        catalog_dir = Path(cmd["warehouse_path"]).expanduser().resolve()
        catalog_dir.mkdir(parents=True, exist_ok=True)
        warehouse_dir = catalog_dir / "warehouse"
        warehouse_dir.mkdir(parents=True, exist_ok=True)
        catalog_path = catalog_dir / "pyiceberg_catalog.db"

        properties = {
            "type": "sql",
            "uri": f"sqlite:///{catalog_path.as_posix()}",
            "warehouse": warehouse_dir.as_uri(),
        }
        catalog = load_catalog("local", **properties)
        catalog.create_namespace_if_not_exists("default")
        catalog.close()

        reloaded = load_catalog("local", **properties)
        namespaces = [list(namespace) for namespace in reloaded.list_namespaces()]
        tables = [list(identifier) for identifier in reloaded.list_tables("default")]
        reloaded.close()

        return {
            "ok": True,
            "metadata_path": str(catalog_path),
            "warehouse_path": str(warehouse_dir),
            "namespaces": namespaces,
            "tables": tables,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


HANDLERS = {
    "install_check": handle_install_check,
    "test_connection": handle_test_connection,
    "list_namespaces": handle_list_namespaces,
    "list_tables": handle_list_tables,
    "get_schema": handle_get_schema,
    "get_snapshots": handle_get_snapshots,
    "preview_table": handle_preview_table,
    "create_metadata_file": handle_create_metadata_file,
}


if __name__ == "__main__":
    try:
        raw = sys.stdin.read()
        cmd = json.loads(raw)
        command_name = cmd.get("command")
        handler = HANDLERS.get(command_name)
        if handler is None:
            print(json.dumps({"ok": False, "error": f"Unknown command: {command_name}"}))
        else:
            result = handler(cmd)
            print(json.dumps(result))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))
