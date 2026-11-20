# AI Policy for Contributors

You can use AI coding tools (Claude Code, Codex, Copilot, Cursor, and others)
to contribute. [AGENTS.md](./AGENTS.md) gives those tools the context and
rules for this repository, and most tools read it automatically.

The same rules apply to every contribution, however it was written.

## You Are the Author

- **Understand every line you submit.** You must be able to explain any change
  in review without asking a tool. "The AI wrote it" isn't an answer to a
  review comment.
- **Run it.** Run the app and the checks yourself before opening a pull
  request. Don't submit code you haven't tested.
- **Keep it scoped.** AI tools tend to touch more than they need to. Remove
  unrelated edits, refactors, and formatting changes before you open the pull
  request (see [CONTRIBUTING.md](./CONTRIBUTING.md#keep-it-scoped)).
- **Write the description yourself**, or check every sentence a tool wrote.
  It must describe what the change actually does.

## Disclose AI Use

Tick the AI box in the pull request template and say briefly which tool you
used and for what (for example "Claude Code wrote the first draft of the
tests"). This helps reviewers; it doesn't count against the pull request.

## Don't

- Open issues, pull requests, or review comments generated in bulk by a tool
  without your own review. We close them.
- Paste secrets, credentials, private data, or customer data into AI tools
  while working on this project.
- Submit code a tool copied from a source whose license isn't compatible with
  AGPL-3.0-only.

## AI Features in the App

Changes to the app's own AI agents, agent tools, providers, or MCP support are
a [sensitive area](./CONTRIBUTING.md#sensitive-areas): agree the design in the
issue first. The app's agents run only the tools Rosetta dbt Studio provides
in its main process, behind its confirmation gate. They never get general
shell access or another agent's built-in tools.
