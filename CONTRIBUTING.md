# Contributing to Rosetta dbt Studio

Thanks for your interest in Rosetta dbt Studio. This guide explains how to pick
up work, set up the app, and get a pull request merged.

Rosetta dbt Studio is licensed under [AGPL-3.0-only](./LICENSE). By
contributing, you agree that your contribution is licensed the same way and
that you have the right to submit it.

- Questions and ideas: [GitHub Discussions](https://github.com/rosettadb/dbt-studio/discussions)
- Security problems: [SECURITY.md](./SECURITY.md) (never a public issue)
- Behavior in the community: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Using AI tools to contribute: [AI_POLICY.md](./AI_POLICY.md)
- What we're working on: [ROADMAP.md](./ROADMAP.md)

## Find Something to Work On

Every pull request closes an issue. This applies to the core team too.

- Check the [Rosetta dbt Studio Roadmap](https://github.com/orgs/rosettadb/projects/1) board.
- Open issues in **Planned** without an assignee or milestone are ready for outside contributions.
- Issues with labels like [`good first issue`](https://github.com/rosettadb/dbt-studio/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22) or [`help wanted`](https://github.com/rosettadb/dbt-studio/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22) are great places to start.
- Issues already **In Progress** or assigned to a team member belong to the core team.

- **Claiming an existing issue**: Comment on the issue first so we can assign you and avoid duplicate work.
- **Want to report and fix it yourself?**: Open the issue first and mention in a comment that you’d like to work on it. Once a maintainer reviews it and moves it to **Planned**, you're good to go!

### Sensitive Areas

Some areas need the design agreed in the issue **before** you write code, and
their pull requests need two maintainer approvals:

- AI agents, agent tools, and MCP (`src/main/services/ai/`)
- Credentials and authentication (keytar storage, OAuth, cloud sign-in)
- Release, packaging, and CI (`.github/`, build scripts, `package.json` files)
- IPC surfaces (`src/main/preload.ts`, `src/main/ipcSetup.ts`,
  `src/main/ipcHandlers/`, `src/types/ipc.ts`)

[`.github/CODEOWNERS`](./.github/CODEOWNERS) lists the exact paths.

## Set Up the App

You need Node.js 20 and npm. On Linux, also install `libsecret-1-dev` (used by
`keytar` to store secrets).

```bash
git clone https://github.com/<you>/dbt-studio.git
cd dbt-studio
npm install
npm start
```

`npm install` builds native modules for Electron, which can take a few minutes.

Useful commands:

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app in development mode |
| `npm run lint` | ESLint over `src/` |
| `npx tsc --noEmit` | Type check of the whole project |
| `npm test` | Jest unit tests (`tests/unit`) |
| `npm run test:integration` | Jest integration tests (needs PostgreSQL, see `.github/workflows/integration-tests.yml`) |
| `npm run test:e2e` | Playwright end-to-end tests |

The Husky pre-push hook runs `tsc --noEmit` and `npm run lint`. CI runs them
again on every pull request, so skipping the hook doesn't skip the checks.

Before writing code, read [AGENTS.md](./AGENTS.md). It describes the
architecture and the rules every change follows. It's written for AI coding
tools, but it's the best short guide for people too.

## Pull Requests

### Keep It Scoped

There is no general limit on lines or files for pull requests. Instead, every pull request must be strictly scoped and feature-limited:

- covers **one issue or one feature**,
- changes **only the files that feature needs**, and
- leaves out unrelated refactors, renames, formatting, and drive-by fixes.
  Open a separate issue or pull request for those.

If the work turns out bigger than the issue described, say so in the issue and
agree on how to split it before you continue.

### Requirements

Pull requests from outside the core team need:

- [ ] `Closes #<issue>` in the description, linking an open issue
- [ ] A [Conventional Commit](https://www.conventionalcommits.org/) title, for
      example `fix(sql-editor): keep cursor position after format`. Allowed
      types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
      `chore`
- [ ] [Signed commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits)
      (GitHub shows "Verified")
- [ ] A signed [CLA](#contributor-license-agreement)
- [ ] Passing `PR Checks` (lint, type check, unit tests) and `Integration Tests`

Open the pull request against `dev`. We squash-merge, so the pull request
title becomes the commit message on `dev`.

### Review

- A maintainer reviews every pull request. Code owners are requested
  automatically. Sensitive areas need two approvals.
- GitHub Actions don't run on a first-time contributor's pull request until a
  maintainer approves the run.
- End-to-end tests are too heavy for CI. For pull requests that change a user
  flow, a maintainer runs them on the team's test machine.
- Reply to review comments within a reasonable time. Keep your pull request active so maintainers can review and merge it.

## Contributor License Agreement

Before we can merge your first pull request, you need to sign the Contributor
License Agreement. The CLA Assistant bot comments on your pull request with a
link; signing takes one click and covers all your future pull requests.

Members of the core team (@rosettadb org members) and automated bots are exempt from the CLA.

## Code of Conduct

Everyone taking part in this project follows the
[Code of Conduct](./CODE_OF_CONDUCT.md).
