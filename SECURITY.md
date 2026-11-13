# Security Policy

## Reporting a Vulnerability

**Don't report security problems in public issues, pull requests, or
Discussions.**

Report them privately through GitHub:

1. Open the repository's [Security tab](https://github.com/rosettadb/dbt-studio/security).
2. Click **Report a vulnerability**.
3. Describe the problem, the affected version, and the steps to reproduce it.

We acknowledge reports within 3 business days and keep you updated while we
work on a fix. When the fix ships, we publish a security advisory and credit
you, unless you ask us not to.

## Supported Versions

We fix security problems in the latest release. Update to the latest version
before reporting, if you can.

## Scope

Rosetta dbt Studio is a desktop app that stores database credentials and AI
provider keys, runs dbt and Python, and lets AI agents use tools on the
user's projects. Examples of what we want to hear about:

- Secrets leaving the OS keychain (keytar), for example into logs, project
  files, `profiles.yml`, or the renderer
- Ways for a project, file, notebook, or web content to run code or reach the
  main process without the user's consent
- AI agents or MCP servers running tools outside the confirmation gate, or
  reading or writing outside the files they should reach
- Problems in sign-in, OAuth, or the update and release process

Problems in a database, dbt adapter, or AI provider itself belong with that
project.
