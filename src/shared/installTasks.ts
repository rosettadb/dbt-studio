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

// dbt commands can't run while dbt Core itself, or the Python it lives in, is
// being replaced.
export const isDbtRuntimeChangeTask = (task: InstallTaskLike): boolean =>
  task.type === 'install:python' ||
  (task.type === 'install:dbt' && isDbtRuntimeSubject(task.subject));

export const isInstallCancelledError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(INSTALL_CANCELLED_MESSAGE);
