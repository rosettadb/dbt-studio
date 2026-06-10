# Rosetta DBT Studio
<img width="1080" alt="image" src="https://raw.githubusercontent.com/rosettadb/dbt-studio/4ee911dec1f1e58ef497babaad59aa2f13a8060d/readme.gif" />

**Rosetta DataBase Transformation Studio** is an open-source desktop application that simplifies your data transformation journey with [dbt Core™](https://www.getdbt.com/) and brings the power of AI into your analytics engineering workflow.

Whether you're just getting started with dbt Core™ or looking to streamline your transformation logic with AI assistance, DBT Studio offers an intuitive interface to help you build, explore, and maintain your data models efficiently.

---

## Features

#### Easy Database & Data Lake Connectivity

- **Multi-Warehouse Support**: Connect seamlessly to traditional data warehouses (including PostgreSQL, SQLite, and more).
- **Data Lake Native (DuckLake)**: Direct connection to your data lakes with dedicated schema views and native Parquet export capabilities.
- **Connection Management**: Easily clone, switch, and manage multiple connections directly from the UI.

#### Layered Data Modeling

- **Staging Layer Generator**: Automatically create staging models based on RAW tables.
- **Enhanced Layer Generator**: Build intermediate models to enrich and prepare your data.
- **Business Models with AI**: Describe the business logic, and let the AI assist you in generating robust business models.
- **AI-Generated Analytical Queries**: Generate analysis-ready queries and dashboard datasets using natural language.

#### SQL Editor & Notebooks

- **SQL Editor**: Explore your data using an in-app SQL editor with auto-run, formatting, and result preview.
- **AI SQL Assistant**: Chat with an AI agent directly inside the SQL Editor — ask questions in natural language, generate queries, inspect results, and iterate without leaving the editor.
- **SQL Notebooks**: Interactive notebooks featuring SQL cells, state persistence, import/export capabilities, and data pagination.

#### Advanced IDE Features

- **Smart Editor**: Full dbt™ autocomplete, Jinja-SQL syntax highlighting, and intelligent language features.
- **File Explorer**: Intuitive file tree with drag-and-drop support and external file import.
- **Pipeline Visualiser**: Visualize your `pipeline.yml` configurations with a live, interactive split-pane viewer.

#### Git Integration

- Use the built-in Git explorer with Select All feature to easily commit and manage project changes.

#### Run dbt™ Commands

- Compile, test, run, and document dbt™ projects directly from the UI—no terminal needed.

#### AI-Powered Workflow

Leverage AI to:

- Automatically draft dbt™ models from descriptions or table schemas.
- Generate joins, transformations, and aggregations with minimal input.
- Translate business questions into SQL queries for analysis.
- **Chat inside the SQL Editor**: Ask the AI to write, explain, or debug queries against your live connection — results appear directly in the editor.

#### Built-in Python Environment

DBT Studio includes an integrated Python environment to:

- Install and manage dbt™ without external setup.
- Seamlessly configure and run dbt™ from within the application.

#### Rosetta Integration

DBT Studio embeds the open-source [Rosetta CLI tool](https://github.com/rosettadb/rosetta) to support metadata-driven dbt™ development:

- Model generation aligned with your naming conventions and standards.
- Reusable templates and YAML documentation support.

---

## 🎥 Demo Videos

Get a quick overview of Rosetta DBT Studio in action:

- [Overview & Features](https://www.youtube.com/watch?v=Y0qI1B7xgD4)  
- [Getting Started](https://www.youtube.com/watch?v=y3OpQ_OXCbY)  
- [AI-Powered Analytics](https://www.youtube.com/watch?v=kFi2KS5qxw8)
- [The Secret Behind DBT Studio](https://www.youtube.com/watch?v=ei9Ay0rFRPQ)

> 💡 More tutorials and walkthroughs are available on our [YouTube Channel](https://www.youtube.com/@rosettadb).

---

## Installation

Download the latest release for your OS from the [Releases Page](https://github.com/rosettadb/dbt-studio/releases) and follow the instructions to get started.

No prior Python or dbt™ installation required.

---

## Development

```bash
cd project-dir
npm install
```
## Starting Development

Start the app in the `dev` environment:

```bash
npm start
```

## Packaging for Production

To package apps for the local platform:

```bash
npm run package
```

The build files after packaging can be found at: ```/release/build```

---

## License

AGPL-3.0 - See [LICENSE](./LICENSE) for details.

