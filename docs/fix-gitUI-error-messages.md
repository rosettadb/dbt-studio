Implementation-Oriented Plan for Enhancing Git Source Control Error Handling
================================================================================

### Scope

Replace all Git Source Control error UX (currently a mix of `toast` + `alert` + missing handlers) with a VSCode-style **blocking modal** (Material-UI `Dialog`) that:

- blocks interaction until the user acknowledges the error
- shows a short message and optional details
- supports contextual actions (e.g. Retry, Add Remote)

Do not use toast/alert for git errors.

### Impacted Components

Source Control folder: `src/renderer/components/sourceControl/`

- `RepositoryHeader.tsx`
  - currently uses `toast.error` for branch operations
  - currently uses `toast.info` for “pending changes” guard
  - currently has `console.error` in `handleSynchronize` catch
  - missing consistent handling for pull/push failures
- `TipTapCommitInput.tsx`
  - currently uses `toast.error` for commit/push errors
- `SourceControlView.tsx`
  - currently uses `alert` for `git init` failure
  - currently has no `onError` handlers for stage/unstage/discard mutations

Other components in this folder (`FileItem`, `ChangesSection`, `BranchDialog`, etc.) do not display errors directly; they should rely on the parent to surface errors via the modal.

### Architecture

Implement a centralized error UI for Source Control **without introducing a new React context/provider**.

#### 1) UI error model
Create a small renderer-side type (local to the Source Control feature) for what the modal needs:

- `title` (e.g. “Push failed”)
- `message` (short user-facing summary)
- `operation` (e.g. `commit`, `push`, `pull`, `stage`, `branch:create`, ...)
- `repoPath?`
- `details?` (optional raw git output; can be added later)
- `primaryActionLabel?` and `onPrimaryAction?` (optional: Retry / Add Remote)

Keep this type **renderer-only** for now; do not change backend payloads in the first iteration.

#### 2) Lift modal state to `SourceControlView`
Add local state in `SourceControlView.tsx`:

- `gitError: GitUiError | null`
- `setGitError(...)`
- `clearGitError()`

Then pass a single callback down into children:

- `onGitError(error: GitUiError)`

This keeps the implementation simple:

- no global provider
- no new context tree
- still “centralized” for the Source Control area

#### 3) Blocking modal UI
Add a new modal component (Material-UI `Dialog`) and render it in `SourceControlView`:

- `open={!!gitError}`
- `onClose={clearGitError}`
- show `gitError.title` + `gitError.message`
- optional primary action button when `gitError.onPrimaryAction` is present

Configure it to be blocking (VSCode-like):

- disable close on backdrop click
- optionally disable `Escape` to close (decision: strict vs convenient)

Use existing MUI dialog patterns already in the codebase (`ConfirmationModal`).

### Wiring Points

#### Central rule
Any git call that can fail must either:

- throw an error into React Query’s `onError`, OR
- return a payload containing `error?: string` and the UI must treat that as failure

#### Required UI wiring changes

Implement the wiring using the hooks that already exist in the feature.

#### `SourceControlView.tsx` (root owner of modal + staging/discard)
1) Add and render the blocking `GitErrorModal` here.
2) Replace `alert(...)` in `GitInitButton` with `setGitError({ title, message, operation: 'init', repoPath })`.
3) Add missing `onError` handlers for mutations created here:

- `useGitStage` / `useGitUnstage`
- `useGitStageAll` / `useGitUnstageAll`
- `useGitDiscardChanges`

Each `onError` should:

- rollback is already handled in controller optimistic updates
- call `setGitError({ title: 'Stage failed', message: error.message ?? 'Unknown error', operation: 'stage', repoPath: projectPath })`

Also: keep `ConfirmationModal` for discard confirmations (that is a different UX than “error”).

4) Pass `onGitError` prop down to:

- `RepositoryHeader`
- `TipTapCommitInput`

#### `RepositoryHeader.tsx` (pull/push/branch)
1) Remove `react-toastify` usage.
2) Accept new prop: `onGitError?: (error: GitUiError) => void`.
3) For branch operations (create/rename/delete/switch):

- replace `toast.error(...)` with `onGitError?.({ title: 'Failed to create branch', message: error.message ?? 'Unknown error', operation: 'branch:create', repoPath: projectPath })`

4) For pending changes guard:

- replace `toast.info(...)` with `onGitError?.({ title: 'Pending changes', message: 'Please commit or discard all changes before switching branches.', operation: 'guard:pending-changes', repoPath: projectPath })`

5) For pull/push:

- add `onError` handlers for thrown errors
- add `onSuccess` checks for the `{ error?: string }` payload (see “Important: pull/push response shape” below)

#### `TipTapCommitInput.tsx` (commit/push/publish)
1) Remove `react-toastify` usage.
2) Accept new prop: `onGitError?: (error: GitUiError) => void`.
3) Replace commit/push `toast.error(...)` with `onGitError?.(...)`.
4) For publish branch UX:

- keep existing `AddGitRemoteModal` opening behavior when there is no remote
- when push fails after remote exists, show blocking modal

#### Important: pull/push response shape
Your controller defines push/pull results as `{ error?: string; authRequired?: boolean }`.
Even if the mutation resolves successfully, the UI must check `data.error` and open the modal.

Recommended handling pattern:

- in `onSuccess(data)`:
  - if `data?.error`:
    - `onGitError?.({ title: 'Push failed', message: data.error, operation: 'push', repoPath: projectPath })`
    - return early (do not call `onSynchronize` / `onCommitSuccess`)
  - else continue success flow

### Validation Checklist

#### UX checks

- modal appears and blocks interaction
- no toasts/alerts for git errors
- message is short + clear
- optional details are available (if provided)

#### Scenario checks

- git init fails (non-writable directory, permission issues)
- commit fails (missing `user.name` / `user.email`, hooks failing)
- push fails (auth rejected)
- push fails (no upstream tracking branch)
- pull fails (conflicts)
- stage/unstage fails (path issues, lock issues)
- discard fails (file permissions)

#### Consistency checks

- after dismissing modal, the UI remains usable
- retry (if implemented) works and updates status lists
- no drift between Source Control list and Monaco editor contents
