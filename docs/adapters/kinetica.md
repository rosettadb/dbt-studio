# Kinetica dbt adapter (dbt-kinetica)

Rosetta DBT Studio registers `kinetica` as a dbt connection type backed by
[dbt-kinetica](https://github.com/rosettadb/kinetica-dbt-adapter) (Apache-2.0).
The adapter talks to Kinetica over HTTP with the `gpudb` client; no ODBC or
JDBC driver is required for dbt.

## Installation

`dbt-kinetica` is not published on PyPI. The Studio installs it into its managed
Python environment from the GitHub source archive:

```
pip install "dbt-kinetica @ https://github.com/rosettadb/kinetica-dbt-adapter/archive/92f4866dad614d24aa1f771585d249ab30a4ac6a.zip"
```

This pulls `dbt-core>=1.8,<2`, `dbt-adapters`, `dbt-common` and `gpudb>=7.2,<8`.
The archive form is used instead of `git+https://...` so that end users do not
need a local `git` executable. The archive is pinned to a reviewed commit SHA
rather than the `main` branch so a later upstream change cannot alter what
users install. The source is declared once in
`src/shared/dbtAdapterPackages.ts`; every install path (onboarding, Settings,
"Install all adapters") reads from it. To pick up a newer upstream revision,
review the commit and bump the SHA there.

Because there is no PyPI release, the Settings screen offers "Install" /
"Update from source" for this adapter instead of a version list.
"Update from source" reinstalls the pinned revision; it only delivers new
upstream code after the SHA in the Studio has been bumped. The adapter
requires dbt Core 1.x; under the dbt Core v2 preview it is reported as
unsupported and execution is blocked, like Postgres.

## Profile mapping

The Kinetica connection form fields map to `profiles.yml` as follows. Values
are exported as `db-<field>-<connection>` environment variables before each
dbt run, exactly like the other adapters.

| Form field | profiles.yml | Notes |
| --- | --- | --- |
| Host / URL + Port + Use SSL | `host` | Built into one URL (`http(s)://host[:port][/path]`) exported as `db-url-<connection>`. The adapter has no separate port field. |
| Username | `user` | `db-user-<connection>` |
| Password | `password` | `db-password-<connection>` |
| Schema | `schema` | Falls back to `ki_home` when empty. |
| Database | `database` | Label only; Kinetica has no databases. Emitted only when set. |
| Bypass SSL Cert Check | `skip_ssl_cert_verification: true` | Only when SSL is on. |
| (fixed) | `disable_auto_discovery: true` | Keeps connections working behind Docker, NAT and load balancers. |
| (fixed) | `threads: 4` | |

The connection form's **timeout** (milliseconds, for the interactive GPUdb
driver) is deliberately not written to the profile. dbt-kinetica's default is
"no limit per HTTP request", which is safer for long-running DDL. Add
`timeout: <seconds>` to `profiles.yml` by hand if needed; the Studio's partial
profile updates preserve custom keys.

## Verifying the integration

1. Create a Kinetica connection, press **Test Connection** (native GPUdb check).
2. Create or attach a dbt project to it and run **Debug** from the project
   dbt menu. `dbt debug` must print `Connection test: [OK connection ok]`.
3. Run the adapter's bundled demo (`examples/demo` in the adapter repo) with
   `KINETICA_HOST`, `KINETICA_USER`, `KINETICA_PASSWORD`, `KINETICA_SCHEMA` set:
   `dbt seed && dbt run && dbt run && dbt test && dbt snapshot && dbt docs generate`.

## Behaviour that differs from other warehouses

- Kinetica auto-commits. dbt-kinetica never sends `BEGIN`/`COMMIT`/`ROLLBACK`;
  hooks run as plain statements.
- Tables and views are replaced in place with `CREATE OR REPLACE`; nothing is
  renamed. Incremental models stage rows in `<model>__dbt_tmp` (TEMP table,
  dropped at the end of the run).
- Relations render as `"schema"."identifier"` with no database part.
  Identifiers are double-quoted and case-sensitive.
- `merge` and `insert_overwrite` incremental strategies raise an error
  (no `MERGE` in Kinetica). Supported: `append` (default), `delete+insert`,
  `microbatch`.
- Not supported: `persist_docs` (logged and skipped), renaming views, source
  freshness from table metadata, Python models.

The Studio itself does not issue transactions, build three-part relation names
or swap tables by rename, so none of the above needed changes in the generic
dbt handling. The only Kinetica-specific accommodation is that lineage parsing
maps the `kinetica` adapter to sqlglot's `postgres` dialect, the closest match.
