// Shared by the main process and the screens so both read install tasks the
// same way. A task's `subject` names what it installs: `dbt-postgres` for the
// latest version (or an uninstall), `dbt-postgres@1.9.0` for one version, and
// `dbt-core@1.11.0` for a dbt Core switch.

export const INSTALL_CANCELLED_MESSAGE = 'Install cancelled';

export const DBT_RUNTIME_CHANGING_MESSAGE =
  'dbt Core is being changed. Try again when it finishes (see Task Manager).';

const DBT_RUNTIME_PACKAGE_NAMES = ['dbt-core', 'dbt-oss'];

interface InstallTaskLike {
  type: string;
  subject?: string;
}

// Installs that go into the managed Python environment, which a Python
// switch rebuilds and a Python uninstall deletes. A switch goes ahead of
// them and cancels the queued dbt ones; a running one finishes first unless
// it is a dbt install that is still safe to stop. An uninstall cancels them
// and stops a running one (except Flowfile and sqlglot, which run pip
// through a shell and finish first).
export const MANAGED_ENVIRONMENT_INSTALL_TYPES = [
  'install:dbt',
  'install:flowfile',
  'install:sqlglot',
  'install:pyiceberg',
];
// Installs with no time limit: Flowfile and sqlglot run pip through a shell,
// which can't be stopped reliably, and the app update uses Electron's
// updater. If one is still running after 30 minutes, a popup says so.
export const UNLIMITED_INSTALL_TYPES = [
  'install:flowfile',
  'install:sqlglot',
  'install:app-update',
];

export const FINISH_BEFORE_PYTHON_INSTALL_TYPES = [
  'install:flowfile',
  'install:sqlglot',
];

export const isInstallTaskType = (type: string): boolean =>
  type.startsWith('install:');

export const isSubjectForPackage = (
  subject: string | undefined,
  packageName: string,
): boolean =>
  !!subject &&
  (subject === packageName || subject.startsWith(`${packageName}@`));

export const isDbtRuntimeSubject = (subject: string | undefined): boolean =>
  DBT_RUNTIME_PACKAGE_NAMES.some((packageName) =>
    isSubjectForPackage(subject, packageName),
  );

// `dbt-core@2.0.5` (or `dbt-core@v2.0.5`) is a switch to dbt Core v2.
export const isDbtV2SwitchSubject = (subject: string | undefined): boolean =>
  isDbtRuntimeSubject(subject) &&
  Number.parseInt(
    (subject?.split('@')[1] ?? '').trim().replace(/^v/i, ''),
    10,
  ) >= 2;

export const DBT_V2_SWITCH_BLOCKS_ADAPTERS_MESSAGE =
  "dbt Core v2 is being installed, so v1 adapters can't be installed now.";

// dbt commands can't run while dbt Core itself, or the Python it lives in, is
// being replaced. Installing a chosen adapter version (`dbt-postgres@1.9.0`)
// counts too: it uses --force-reinstall, which reinstalls dbt-core with it.
export const isDbtRuntimeChangeTask = (task: InstallTaskLike): boolean =>
  task.type === 'install:python' ||
  (task.type === 'install:dbt' &&
    (isDbtRuntimeSubject(task.subject) || !!task.subject?.includes('@')));

export const isInstallCancelledError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(INSTALL_CANCELLED_MESSAGE);
