# Duckdb httpfs Extension for HTTP and S3 Support

---
layout: docu
redirect_from:
- /docs/guides/import/cloudflare_r2_import
- /docs/guides/network_cloud_storage/cloudflare_r2_import
title: Cloudflare R2 Import
---

## Prerequisites

For Cloudflare R2, the [S3 Compatibility API](https://developers.cloudflare.com/r2/api/s3/api/) allows you to use DuckDB's S3 support to read and write from R2 buckets.

This requires the [`httpfs` extension]({% link docs/stable/core_extensions/httpfs/overview.md %}), which can be installed using the `INSTALL` SQL command. This only needs to be run once.

## Credentials and Configuration

You will need to [generate an S3 auth token](https://developers.cloudflare.com/r2/api/s3/tokens/) and create an `R2` secret in DuckDB:

```sql
CREATE SECRET (
    TYPE r2,
    KEY_ID '⟨AKIAIOSFODNN7EXAMPLE⟩',
    SECRET '⟨wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY⟩',
    ACCOUNT_ID '⟨your-33-character-hexadecimal-account-ID⟩'
);
```

## Querying

After setting up the R2 credentials, you can query the R2 data using DuckDB's built-in methods, such as `read_csv` or `read_parquet`:

```sql
SELECT * FROM read_parquet('r2://⟨r2-bucket-name⟩/⟨file⟩');
```

---
layout: docu
redirect_from:
- /docs/extensions/httpfs/https
- /docs/stable/extensions/httpfs/https
title: HTTP(S) Support
---

With the `httpfs` extension, it is possible to directly query files over the HTTP(S) protocol. This works for all files supported by DuckDB or its various extensions, and provides read-only access.

```sql
SELECT *
FROM 'https://domain.tld/file.extension';
```

## Partial Reading

For CSV files, files will be downloaded entirely in most cases, due to the row-based nature of the format.
For Parquet files, DuckDB supports [partial reading]({% link docs/stable/data/parquet/overview.md %}#partial-reading), i.e., it can use a combination of the Parquet metadata and [HTTP range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests) to only download the parts of the file that are actually required by the query. For example, the following query will only read the Parquet metadata and the data for the `column_a` column:

```sql
SELECT column_a
FROM 'https://domain.tld/file.parquet';
```

In some cases, no actual data needs to be read at all as they only require reading the metadata:

```sql
SELECT count(*)
FROM 'https://domain.tld/file.parquet';
```

## Scanning Multiple Files

Scanning multiple files over HTTP(S) is also supported:

```sql
SELECT *
FROM read_parquet([
    'https://domain.tld/file1.parquet',
    'https://domain.tld/file2.parquet'
]);
```

## Authenticating

To authenticate for an HTTP(S) endpoint, create an `HTTP` secret using the [Secrets Manager]({% link docs/stable/configuration/secrets_manager.md %}):

```sql
CREATE SECRET http_auth (
    TYPE http,
    BEARER_TOKEN '⟨token⟩'
);
```

Or:

```sql
CREATE SECRET http_auth (
    TYPE http,
    EXTRA_HTTP_HEADERS MAP {
        'Authorization': 'Bearer ⟨token⟩'
    }
);
```

## HTTP Proxy

DuckDB supports HTTP proxies.

You can add an HTTP proxy using the [Secrets Manager]({% link docs/stable/configuration/secrets_manager.md %}):

```sql
CREATE SECRET http_proxy (
    TYPE http,
    HTTP_PROXY '⟨http_proxy_url⟩',
    HTTP_PROXY_USERNAME '⟨username⟩',
    HTTP_PROXY_PASSWORD '⟨password⟩'
);
```

Alternatively, you can add it via [configuration options]({% link docs/stable/configuration/pragmas.md %}):

```sql
SET http_proxy = '⟨http_proxy_url⟩';
SET http_proxy_username = '⟨username⟩';
SET http_proxy_password = '⟨password⟩';
```

## Using a Custom Certificate File

To use the `httpfs` extension with a custom certificate file, set the following [configuration options]({% link docs/stable/configuration/pragmas.md %}) prior to loading the extension:

```sql
LOAD httpfs;
SET ca_cert_file = '⟨certificate_file⟩';
SET enable_server_cert_verification = true;
```

---
github_repository: https://github.com/duckdb/duckdb-httpfs
layout: docu
redirect_from:
- /docs/extensions/httpfs
- /docs/extensions/httpfs/overview
- /docs/stable/extensions/httpfs
- /docs/stable/extensions/httpfs/overview
title: httpfs Extension for HTTP and S3 Support
---

The `httpfs` extension is an autoloadable extension implementing a file system that allows reading remote/writing remote files.
For plain HTTP(S), only file reading is supported. For object storage using the S3 API, the `httpfs` extension supports reading/writing/[globbing]({% link docs/stable/sql/functions/pattern_matching.md %}#globbing) files.

## Installation and Loading

The `httpfs` extension will be, by default, autoloaded on first use of any functionality exposed by this extension.

To manually install and load the `httpfs` extension, run:

```sql
INSTALL httpfs;
LOAD httpfs;
```

## HTTP(S)

The `httpfs` extension supports connecting to [HTTP(S) endpoints]({% link docs/stable/core_extensions/httpfs/https.md %}).

## S3 API

The `httpfs` extension supports connecting to [S3 API endpoints]({% link docs/stable/core_extensions/httpfs/s3api.md %}).

------

---
layout: docu
redirect_from:
- /docs/extensions/httpfs/https
- /docs/stable/extensions/httpfs/https
title: HTTP(S) Support
---

With the `httpfs` extension, it is possible to directly query files over the HTTP(S) protocol. This works for all files supported by DuckDB or its various extensions, and provides read-only access.

```sql
SELECT *
FROM 'https://domain.tld/file.extension';
```

## Partial Reading

For CSV files, files will be downloaded entirely in most cases, due to the row-based nature of the format.
For Parquet files, DuckDB supports [partial reading]({% link docs/stable/data/parquet/overview.md %}#partial-reading), i.e., it can use a combination of the Parquet metadata and [HTTP range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests) to only download the parts of the file that are actually required by the query. For example, the following query will only read the Parquet metadata and the data for the `column_a` column:

```sql
SELECT column_a
FROM 'https://domain.tld/file.parquet';
```

In some cases, no actual data needs to be read at all as they only require reading the metadata:

```sql
SELECT count(*)
FROM 'https://domain.tld/file.parquet';
```

## Scanning Multiple Files

Scanning multiple files over HTTP(S) is also supported:

```sql
SELECT *
FROM read_parquet([
    'https://domain.tld/file1.parquet',
    'https://domain.tld/file2.parquet'
]);
```

## Authenticating

To authenticate for an HTTP(S) endpoint, create an `HTTP` secret using the [Secrets Manager]({% link docs/stable/configuration/secrets_manager.md %}):

```sql
CREATE SECRET http_auth (
    TYPE http,
    BEARER_TOKEN '⟨token⟩'
);
```

Or:

```sql
CREATE SECRET http_auth (
    TYPE http,
    EXTRA_HTTP_HEADERS MAP {
        'Authorization': 'Bearer ⟨token⟩'
    }
);
```

## HTTP Proxy

DuckDB supports HTTP proxies.

You can add an HTTP proxy using the [Secrets Manager]({% link docs/stable/configuration/secrets_manager.md %}):

```sql
CREATE SECRET http_proxy (
    TYPE http,
    HTTP_PROXY '⟨http_proxy_url⟩',
    HTTP_PROXY_USERNAME '⟨username⟩',
    HTTP_PROXY_PASSWORD '⟨password⟩'
);
```

Alternatively, you can add it via [configuration options]({% link docs/stable/configuration/pragmas.md %}):

```sql
SET http_proxy = '⟨http_proxy_url⟩';
SET http_proxy_username = '⟨username⟩';
SET http_proxy_password = '⟨password⟩';
```

## Using a Custom Certificate File

To use the `httpfs` extension with a custom certificate file, set the following [configuration options]({% link docs/stable/configuration/pragmas.md %}) prior to loading the extension:

```sql
LOAD httpfs;
SET ca_cert_file = '⟨certificate_file⟩';
SET enable_server_cert_verification = true;
```

--------

---
layout: docu
redirect_from:
- /docs/extensions/httpfs/hugging_face
- /docs/stable/extensions/httpfs/hugging_face
title: Hugging Face Support
---

The `httpfs` extension introduces support for the `hf://` protocol to access datasets hosted in [Hugging Face](https://huggingface.co/) repositories.
See the [announcement blog post]({% post_url 2024-05-29-access-150k-plus-datasets-from-hugging-face-with-duckdb %}) for details.

## Usage

Hugging Face repositories can be queried using the following URL pattern:

```text
hf://datasets/⟨my_username⟩/⟨my_dataset⟩/⟨path_to_file⟩
```

For example, to read a CSV file, you can use the following query:

```sql
SELECT *
FROM 'hf://datasets/datasets-examples/doc-formats-csv-1/data.csv';
```

Where:

* `datasets-examples` is the name of the user/organization
* `doc-formats-csv-1` is the name of the dataset repository
* `data.csv` is the file path in the repository

The result of the query is:

|  kind   | sound |
|---------|-------|
| dog     | woof  |
| cat     | meow  |
| pokemon | pika  |
| human   | hello |

To read a JSONL file, you can run:

```sql
SELECT *
FROM 'hf://datasets/datasets-examples/doc-formats-jsonl-1/data.jsonl';
```

Finally, for reading a Parquet file, use the following query:

```sql
SELECT *
FROM 'hf://datasets/datasets-examples/doc-formats-parquet-1/data/train-00000-of-00001.parquet';
```

Each of these commands reads the data from the specified file format and displays it in a structured tabular format. Choose the appropriate command based on the file format you are working with.

## Creating a Local Table

To avoid accessing the remote endpoint for every query, you can save the data in a DuckDB table by running a [`CREATE TABLE ... AS` command]({% link docs/stable/sql/statements/create_table.md %}#create-table--as-select-ctas). For example:

```sql
CREATE TABLE data AS
    SELECT *
    FROM 'hf://datasets/datasets-examples/doc-formats-csv-1/data.csv';
```

Then, simply query the `data` table as follows:

```sql
SELECT *
FROM data;
```

## Multiple Files

To query all files under a specific directory, you can use a [glob pattern]({% link docs/stable/data/multiple_files/overview.md %}#multi-file-reads-and-globs). For example:

```sql
SELECT count(*) AS count
FROM 'hf://datasets/cais/mmlu/astronomy/*.parquet';
```

| count |
|------:|
| 173   |

By using glob patterns, you can efficiently handle large datasets and perform comprehensive queries across multiple files, simplifying your data inspections and processing tasks.
Here, you can see how you can look for questions that contain the word “planet” in astronomy:

```sql
SELECT count(*) AS count
FROM 'hf://datasets/cais/mmlu/astronomy/*.parquet'
WHERE question LIKE '%planet%';
```

| count |
|------:|
| 21    |

## Versioning and Revisions

In Hugging Face repositories, dataset versions or revisions are different dataset updates. Each version is a snapshot at a specific time, allowing you to track changes and improvements. In git terms, it can be understood as a branch or specific commit.

You can query different dataset versions/revisions by using the following URL:

```sql
hf://datasets/⟨my_username⟩/⟨my_dataset⟩@⟨my_branch⟩/⟨path_to_file⟩
```

For example:

```sql
SELECT *
FROM 'hf://datasets/datasets-examples/doc-formats-csv-1@~parquet/**/*.parquet';
```

|  kind   | sound |
|---------|-------|
| dog     | woof  |
| cat     | meow  |
| pokemon | pika  |
| human   | hello |

The previous query will read all Parquet files under the `~parquet` revision. This is a special branch where Hugging Face automatically generates the Parquet files of every dataset to enable efficient scanning.

## Authentication

Configure your Hugging Face Token in the DuckDB Secrets Manager to access private or gated datasets.
First, visit [Hugging Face Settings – Tokens](https://huggingface.co/settings/tokens) to obtain your access token.
Second, set it in your DuckDB session using DuckDB’s [Secrets Manager]({% link docs/stable/configuration/secrets_manager.md %}). DuckDB supports two providers for managing secrets:

### `CONFIG`

The user must pass all configuration information into the `CREATE SECRET` statement. To create a secret using the `CONFIG` provider, use the following command:

```sql
CREATE SECRET hf_token (
    TYPE huggingface,
    TOKEN 'your_hf_token'
);
```

### `credential_chain`

Automatically tries to fetch credentials. For the Hugging Face token, it will try to get it from `~/.cache/huggingface/token`. To create a secret using the `credential_chain` provider, use the following command:

```sql
CREATE SECRET hf_token (
    TYPE huggingface,
    PROVIDER credential_chain
);
```

-----

---
layout: docu
redirect_from:
- /docs/extensions/httpfs/s3api
- /docs/stable/extensions/httpfs/s3api
title: S3 API Support
---

The `httpfs` extension supports reading/writing/[globbing](#globbing) files on object storage servers using the S3 API. S3 offers a standard API to read and write to remote files (while regular http servers, predating S3, do not offer a common write API). DuckDB conforms to the S3 API, that is now common among industry storage providers.

## Platforms

The `httpfs` filesystem is tested with [AWS S3](https://aws.amazon.com/s3/), [Minio](https://min.io/), [Google Cloud](https://cloud.google.com/storage/docs/interoperability) and [lakeFS](https://docs.lakefs.io/integrations/duckdb.html). Other services that implement the S3 API (such as [Cloudflare R2](https://www.cloudflare.com/en-gb/developer-platform/r2/)) should also work, but not all features may be supported.

The following table shows which parts of the S3 API are required for each `httpfs` feature.

| Feature | Required S3 API features |
|:---|:---|
| Public file reads | HTTP Range requests |
| Private file reads | Secret key or session token authentication |
| File glob | [ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html) |
| File writes | [Multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) |

## Configuration and Authentication

The preferred way to configure and authenticate to S3 endpoints is to use [secrets]({% link docs/stable/sql/statements/create_secret.md %}). Multiple secret providers are available.

To migrate from the [deprecated S3 API]({% link docs/stable/core_extensions/httpfs/s3api_legacy_authentication.md %}), use a defined secret with a profile.
See the [“Loading a Secret Based on a Profile” section](#loading-a-secret-based-on-a-profile).

### `config` Provider

The default provider, `config` (i.e., user-configured), allows access to the S3 bucket by manually providing a key. For example:

```sql
CREATE OR REPLACE SECRET secret (
    TYPE s3,
    PROVIDER config,
    KEY_ID '⟨AKIAIOSFODNN7EXAMPLE⟩',
    SECRET '⟨wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY⟩',
    REGION '⟨us-east-1⟩'
);
```

> Tip If you get an IO Error (`Connection error for HTTP HEAD`), configure the endpoint explicitly via `ENDPOINT 's3.⟨your-region⟩.amazonaws.com'`{:.language-sql .highlight}.

Now, to query using the above secret, simply query any `s3://` prefixed file:

```sql
SELECT *
FROM 's3://⟨your-bucket⟩/⟨your_file⟩.parquet';
```

### `credential_chain` Provider

The `credential_chain` provider allows automatically fetching credentials using mechanisms provided by the AWS SDK. For example, to use the AWS SDK default provider:

```sql
CREATE OR REPLACE SECRET secret (
    TYPE s3,
    PROVIDER credential_chain
);
```

Again, to query a file using the above secret, simply query any `s3://` prefixed file.

DuckDB also allows specifying a specific chain using the `CHAIN` keyword. This takes a semicolon-separated list (`a;b;c`) of providers that will be tried in order. For example:

```sql
CREATE OR REPLACE SECRET secret (
    TYPE s3,
    PROVIDER credential_chain,
    CHAIN 'env;config'
);
```

The possible values for `CHAIN` are the following:

* [`config`](https://sdk.amazonaws.com/cpp/api/LATEST/aws-cpp-sdk-core/html/class_aws_1_1_auth_1_1_profile_config_file_a_w_s_credentials_provider.html)
* [`sts`](https://sdk.amazonaws.com/cpp/api/LATEST/aws-cpp-sdk-core/html/class_aws_1_1_auth_1_1_s_t_s_assume_role_web_identity_credentials_provider.html)
* [`sso`](https://aws.amazon.com/what-is/sso/)
* [`env`](https://sdk.amazonaws.com/cpp/api/LATEST/aws-cpp-sdk-core/html/class_aws_1_1_auth_1_1_environment_a_w_s_credentials_provider.html)
* [`instance`](https://sdk.amazonaws.com/cpp/api/LATEST/aws-cpp-sdk-core/html/class_aws_1_1_auth_1_1_instance_profile_credentials_provider.html)
* [`process`](https://sdk.amazonaws.com/cpp/api/LATEST/aws-cpp-sdk-core/html/class_aws_1_1_auth_1_1_process_credentials_provider.html)

The `credential_chain` provider also allows overriding the automatically fetched config. For example, to automatically load credentials, and then override the region, run:

```sql
CREATE OR REPLACE SECRET secret (
    TYPE s3,
    PROVIDER credential_chain,
    CHAIN config,
    REGION '⟨eu-west-1⟩'
);
```

#### Loading a Secret Based on a Profile

To load credentials based on a profile which is not defined as a default from the `AWS_PROFILE` environment variable or as a default profile based on AWS SDK precedence, run:

```sql
CREATE OR REPLACE SECRET secret (
    TYPE s3,
    PROVIDER credential_chain,
    CHAIN config,
    PROFILE '⟨my_profile⟩'
);
```

This approach is equivalent to the [deprecated S3 API's]({% link docs/stable/core_extensions/httpfs/s3api_legacy_authentication.md %})'s method `load_aws_credentials('⟨my_profile⟩')`.

### Overview of S3 Secret Parameters

Below is a complete list of the supported parameters that can be used for both the `config` and `credential_chain` providers:

| Name                          | Description                                                                           | Secret            | Type      | Default                                     |
|:------------------------------|:--------------------------------------------------------------------------------------|:------------------|:----------|:--------------------------------------------|
| `ENDPOINT`                    | Specify a custom S3 endpoint                                                          | `S3`, `GCS`, `R2` | `STRING`  | `s3.amazonaws.com` for `S3`,                |
| `KEY_ID`                      | The ID of the key to use                                                              | `S3`, `GCS`, `R2` | `STRING`  | -                                           |
| `REGION`                      | The region for which to authenticate (should match the region of the bucket to query) | `S3`, `GCS`, `R2` | `STRING`  | `us-east-1`                                 |
| `SECRET`                      | The secret of the key to use                                                          | `S3`, `GCS`, `R2` | `STRING`  | -                                           |
| `SESSION_TOKEN`               | Optionally, a session token can be passed to use temporary credentials                | `S3`, `GCS`, `R2` | `STRING`  | -                                           |
| `URL_COMPATIBILITY_MODE`      | Can help when URLs contain problematic characters                                     | `S3`, `GCS`, `R2` | `BOOLEAN` | `true`                                      |
| `URL_STYLE`                   | Either `vhost` or `path`                                                              | `S3`, `GCS`, `R2` | `STRING`  | `vhost` for `S3`, `path` for `R2` and `GCS` |
| `USE_SSL`                     | Whether to use HTTPS or HTTP                                                          | `S3`, `GCS`, `R2` | `BOOLEAN` | `true`                                      |
| `ACCOUNT_ID`                  | The R2 account ID to use for generating the endpoint URL                              | `R2`              | `STRING`  | -                                           |
| `KMS_KEY_ID`                  | AWS KMS (Key Management Service) key for Server Side Encryption S3                    | `S3`              | `STRING`  | -                                           |
| `REQUESTER_PAYS`              | Allows use of "requester pays" S3 buckets                                             | `S3`              | `BOOLEAN` | `false`                                     |

### Platform-Specific Secret Types

#### S3 Secrets

The httpfs extension supports [Server Side Encryption via the AWS Key Management Service (KMS) on S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html) using the `KMS_KEY_ID` option:

```sql
CREATE OR REPLACE SECRET secret (
    TYPE s3,
    PROVIDER credential_chain,
    CHAIN config,
    REGION '⟨eu-west-1⟩',
    KMS_KEY_ID 'arn:aws:kms:⟨region⟩:⟨account_id⟩:⟨key⟩/⟨key_id⟩',
    SCOPE 's3://⟨bucket-sub-path⟩'
);
```

#### R2 Secrets

While [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2) uses the regular S3 API, DuckDB has a special Secret type, `R2`, to make configuring it a bit simpler:

```sql
CREATE OR REPLACE SECRET secret (
    TYPE r2,
    KEY_ID '⟨AKIAIOSFODNN7EXAMPLE⟩',
    SECRET '⟨wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY⟩',
    ACCOUNT_ID '⟨my_account_id⟩'
);
```

Note the addition of the `ACCOUNT_ID` which is used to generate the correct endpoint URL for you. Also note that `R2` Secrets can also use both the `CONFIG` and `credential_chain` providers. However, since DuckDB uses an AWS client internally, when using `credential_chain`, the client will search for AWS credentials in the standard AWS credential locations (environment variables, credential files, etc.). Therefore, your R2 credentials must be made available as AWS environment variables (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`) for the credential chain to work properly. Finally, `R2` secrets are only available when using URLs starting with `r2://`, for example:

```sql
SELECT *
FROM read_parquet('r2://⟨some-file-that-uses-an-r2-secret⟩.parquet');
```

#### GCS Secrets

While [Google Cloud Storage](https://cloud.google.com/storage) is accessed by DuckDB using the S3 API, DuckDB has a special Secret type, `GCS`, to make configuring it a bit simpler:

```sql
CREATE OR REPLACE SECRET secret (
    TYPE gcs,
    KEY_ID '⟨my_hmac_access_id⟩',
    SECRET '⟨my_hmac_secret_key⟩'
);
```


**Important**: The `KEY_ID` and `SECRET` values must be HMAC keys generated specifically for Google Cloud Storage interoperability. These are not the same as regular GCP service account keys or access tokens. You can create HMAC keys by following the [Google Cloud documentation for managing HMAC keys](https://cloud.google.com/storage/docs/authentication/managing-hmackeys).

Note that the above secret will automatically have the correct Google Cloud Storage endpoint configured. Also note that `GCS` Secrets can also use both the `CONFIG` and `credential_chain` providers. However, since DuckDB uses an AWS client internally, when using `credential_chain`, the client will search for AWS credentials in the standard AWS credential locations (environment variables, credential files, etc.). Therefore, your GCS HMAC keys must be made available as AWS environment variables (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`) for the credential chain to work properly. Finally, `GCS` secrets are only available when using URLs starting with `gcs://` or `gs://`, for example:

```sql
SELECT *
FROM read_parquet('gcs://⟨some/file/that/uses/a/gcs/secret⟩.parquet');
```

## Reading

Reading files from S3 is now as simple as:

```sql
SELECT *
FROM 's3://⟨your-bucket⟩/⟨filename⟩.⟨extension⟩';
```

### Partial Reading

The `httpfs` extension supports [partial reading]({% link docs/stable/core_extensions/httpfs/https.md %}#partial-reading) from S3 buckets.

### Reading Multiple Files

Multiple files are also possible, for example:

```sql
SELECT *
FROM read_parquet([
    's3://⟨your-bucket⟩/⟨filename-1⟩.parquet',
    's3://⟨your-bucket⟩/⟨filename-2⟩.parquet'
]);
```

### Globbing

File [globbing]({% link docs/stable/sql/functions/pattern_matching.md %}#globbing) is implemented using the ListObjectsV2 API call and allows using filesystem-like glob patterns to match multiple files, for example:

```sql
SELECT *
FROM read_parquet('s3://⟨your-bucket⟩/*.parquet');
```

This query matches all files in the root of the bucket with the [Parquet extension]({% link docs/stable/data/parquet/overview.md %}).

Several features for matching are supported, such as `*` to match any number of any character, `?` for any single character or `[0-9]` for a single character in a range of characters:

```sql
SELECT count(*) FROM read_parquet('s3://⟨your-bucket⟩/folder*/100?/t[0-9].parquet');
```

A useful feature when using globs is the `filename` option, which adds a column named `filename` that encodes the file that a particular row originated from:

```sql
SELECT *
FROM read_parquet('s3://⟨your-bucket⟩/*.parquet', filename = true);
```

This could for example result in:

| column_a | column_b | filename |
|:---|:---|:---|
| 1 | examplevalue1 | s3://bucket-name/file1.parquet |
| 2 | examplevalue1 | s3://bucket-name/file2.parquet |

### Hive Partitioning

DuckDB also offers support for the [Hive partitioning scheme]({% link docs/stable/data/partitioning/hive_partitioning.md %}), which is available when using HTTP(S) and S3 endpoints.

## Writing

Writing to S3 uses the multipart upload API. This allows DuckDB to robustly upload files at high speed. Writing to S3 works for both CSV and Parquet:

```sql
COPY table_name TO 's3://⟨your-bucket⟩/⟨filename⟩.⟨extension⟩';
```

Partitioned copy to S3 also works:

```sql
COPY table TO 's3://⟨your-bucket⟩/partitioned' (
    FORMAT parquet,
    PARTITION_BY (⟨part_col_a⟩, ⟨part_col_b⟩)
);
```

An automatic check is performed for existing files/directories, which is currently quite conservative (and on S3 will add a bit of latency). To disable this check and force writing, an `OVERWRITE_OR_IGNORE` flag is added:

```sql
COPY table TO 's3://⟨your-bucket⟩/partitioned' (
    FORMAT parquet,
    PARTITION_BY (⟨part_col_a⟩, ⟨part_col_b⟩),
    OVERWRITE_OR_IGNORE true
);
```

The naming scheme of the written files looks like this:

```sql
s3://⟨your-bucket⟩/partitioned/part_col_a=⟨val⟩/part_col_b=⟨val⟩/data_⟨thread_number⟩.parquet
```

### Configuration

Some additional configuration options exist for the S3 upload, though the default values should suffice for most use cases.

| Name | Description |
|:---|:---|
| `s3_uploader_max_parts_per_file` | Used for part size calculation, see [AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html) |
| `s3_uploader_max_filesize` | Used for part size calculation, see [AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html) |
| `s3_uploader_thread_limit` | Maximum number of uploader threads |