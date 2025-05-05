# Rosetta DBT Studio

**Rosetta DBT Studio** is an open-source desktop application that simplifies your data transformation journey with [dbt™](https://www.getdbt.com/) and brings the power of AI into your analytics engineering workflow.

Whether you're just getting started with dbt™ or looking to streamline your transformation logic with AI assistance, Rosetta DBT Studio offers an intuitive interface to help you build, explore, and maintain your data models efficiently.

---

## Features

#### Easy Database Connectivity

- Connect to your data warehouse assuming your **RAW layer** is already in place.

#### Layered Data Modeling

- **Staging Layer Generator**: Automatically create staging models based on RAW tables.
- **Enhanced Layer Generator**: Build intermediate models to enrich and prepare your data.
- **Business Models with AI**: Describe the business logic, and let the AI assist you in generating robust business models.
- **AI-Generated Analytical Queries**: Generate analysis-ready queries and dashboard datasets using natural language.

#### SQL Editor

- Explore your data using an in-app SQL editor with auto-run, formatting, and result preview.

#### Git Integration

- Use the built-in Git explorer with Select All feature to easily commit and manage project changes.

#### Run dbt™ Commands

- Compile, test, run, and document dbt™ projects directly from the UI—no terminal needed.

#### AI-Powered Workflow

Leverage AI to:

- Automatically draft dbt™ models from descriptions or table schemas.
- Generate joins, transformations, and aggregations with minimal input.
- Translate business questions into SQL queries for analysis.

#### Built-in Python Environment

Rosetta DBT Studio includes an integrated Python environment to:

- Install and manage dbt™ without external setup.
- Seamlessly configure and run dbt™ from within the application.

#### Rosetta Integration

Rosetta DBT Studio embeds the open-source [Rosetta CLI tool](https://github.com/adaptivescale/rosetta) to support metadata-driven dbt development:

- Model generation aligned with your naming conventions and standards.
- Reusable templates and YAML documentation support.

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

This project is licensed under the [MIT License](LICENSE).

