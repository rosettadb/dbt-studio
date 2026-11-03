import {
  isDbtRuntimeChangeTask,
  isDbtV2SwitchSubject,
} from '../../../src/shared/installTasks';

describe('isDbtV2SwitchSubject', () => {
  it('reads a switch to v2 with or without a leading v', () => {
    expect(isDbtV2SwitchSubject('dbt-core@2.0.5')).toBe(true);
    expect(isDbtV2SwitchSubject('dbt-core@v2.0.5')).toBe(true);
    expect(isDbtV2SwitchSubject('dbt-core@V2.0.5')).toBe(true);
  });

  it('is false for v1 versions and adapters', () => {
    expect(isDbtV2SwitchSubject('dbt-core@1.11.12')).toBe(false);
    expect(isDbtV2SwitchSubject('dbt-core@v1.11.12')).toBe(false);
    expect(isDbtV2SwitchSubject('dbt-postgres@2.0.0')).toBe(false);
    expect(isDbtV2SwitchSubject(undefined)).toBe(false);
  });
});

describe('isDbtRuntimeChangeTask', () => {
  const dbtTask = (subject: string) => ({ type: 'install:dbt', subject });

  it('counts dbt Core changes and Python installs', () => {
    expect(isDbtRuntimeChangeTask(dbtTask('dbt-core@1.11.12'))).toBe(true);
    expect(isDbtRuntimeChangeTask(dbtTask('dbt-core'))).toBe(true);
    expect(isDbtRuntimeChangeTask({ type: 'install:python' })).toBe(true);
  });

  it('counts a chosen adapter version, which reinstalls dbt-core with it', () => {
    expect(isDbtRuntimeChangeTask(dbtTask('dbt-postgres@1.9.0'))).toBe(true);
  });

  it('does not count latest adapter installs or other installs', () => {
    expect(isDbtRuntimeChangeTask(dbtTask('dbt-postgres'))).toBe(false);
    expect(isDbtRuntimeChangeTask({ type: 'install:flowfile' })).toBe(false);
  });
});
