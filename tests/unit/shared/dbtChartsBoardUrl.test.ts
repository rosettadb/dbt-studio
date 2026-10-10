import { boardUrlPath } from '../../../src/shared/dbtCharts';
import { boardUrl } from '../../../src/main/utils/dbtChartsServer';

describe('boardUrlPath', () => {
  it.each([
    ['charts/index.yml', '/'],
    ['charts/sales.yml', '/sales/'],
    ['charts/a/index.yml', '/a/'],
    ['charts/a/b.yml', '/a/b/'],
    ['charts\\a\\b.yaml', '/a/b/'],
  ])('%s -> %s', (file, expected) => {
    expect(boardUrlPath(file)).toBe(expected);
  });

  it('boardUrl accepts absolute paths inside the project', () => {
    expect(boardUrl('/p', '/p/charts/sales.yml')).toBe('/sales/');
    expect(boardUrl('/p', 'charts/index.yml')).toBe('/');
  });
});
