import {
  isChartBoardFile,
  toProjectRelativePath,
} from '../../../../src/renderer/components/dbtCharts/boardFiles';

const root = '/Users/me/proj';

describe('isChartBoardFile', () => {
  it.each([
    [`${root}/charts/a.yml`, true],
    [`${root}/charts/x/b.yaml`, true],
    [`${root}/dbt_charts.yml`, false],
    [`${root}/models/x.yml`, false],
    [`${root}/charts/readme.md`, false],
    ['/other/charts/a.yml', false],
  ])('%s -> %s', (file, expected) => {
    expect(isChartBoardFile(root, file)).toBe(expected);
  });

  it('handles Windows separators', () => {
    expect(isChartBoardFile('C:\\proj', 'C:\\proj\\charts\\a.yml')).toBe(true);
  });

  it('toProjectRelativePath returns null outside the project', () => {
    expect(toProjectRelativePath(root, '/x/y.yml')).toBeNull();
    expect(toProjectRelativePath(root, `${root}/charts/a.yml`)).toBe(
      'charts/a.yml',
    );
  });
});
