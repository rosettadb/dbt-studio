import {
  boardUrlPath,
  chartsRelativePath,
  folderUrlPath,
  isChartsBoardPath,
  isChartsPartial,
  looksLikeChartsPath,
} from '../../../src/shared/dbtCharts';

const PROJECT = '/projects/shop';
const at = (relative: string) => `${PROJECT}/${relative}`;

describe('isChartsBoardPath', () => {
  it.each([
    'charts/a.yml',
    'charts/x/b.yaml',
    'charts/_p.yml',
    'charts/meta.yml',
    'charts/Sales.YML',
  ])('accepts %s', (relative) => {
    expect(isChartsBoardPath(PROJECT, at(relative))).toBe(true);
  });

  it.each([
    'dbt_charts.yml',
    'models/charts/a.yml',
    'charts/readme.md',
    'rosetta/pipelines/charts/a.yml',
    'charts',
    'charts/../models/a.yml',
  ])('rejects %s', (relative) => {
    expect(isChartsBoardPath(PROJECT, at(relative))).toBe(false);
  });

  it('rejects a path outside the project', () => {
    expect(isChartsBoardPath(PROJECT, '/projects/other/charts/a.yml')).toBe(
      false,
    );
    expect(isChartsBoardPath(PROJECT, '/projects/shop2/charts/a.yml')).toBe(
      false,
    );
  });

  it('handles Windows backslash paths case-insensitively', () => {
    expect(
      isChartsBoardPath(
        'C:\\Projects\\Shop',
        'c:\\projects\\shop\\charts\\a.yml',
      ),
    ).toBe(true);
    expect(
      isChartsBoardPath(
        'C:\\Projects\\Shop',
        'C:\\Projects\\Shop\\models\\charts\\a.yml',
      ),
    ).toBe(false);
  });
});

describe('looksLikeChartsPath', () => {
  it('matches any charts folder segment with a YAML file', () => {
    expect(looksLikeChartsPath('/x/charts/a.yml')).toBe(true);
    expect(looksLikeChartsPath('/x/models/charts/a.yaml')).toBe(true);
    expect(looksLikeChartsPath('/x/charts.yml')).toBe(false);
    expect(looksLikeChartsPath('/x/charts/readme.md')).toBe(false);
  });
});

describe('isChartsPartial', () => {
  it('treats _files and meta.yml as partials', () => {
    expect(isChartsPartial(at('charts/_queries.yml'))).toBe(true);
    expect(isChartsPartial(at('charts/a/meta.yaml'))).toBe(true);
    expect(isChartsPartial(at('charts/sales.yml'))).toBe(false);
  });
});

describe('boardUrlPath', () => {
  it.each([
    ['charts/index.yml', '/'],
    ['charts/sales.yml', '/sales/'],
    ['charts/a/index.yml', '/a/'],
    ['charts/a/b.yaml', '/a/b/'],
    ['charts/my board.yml', '/my%20board/'],
  ])('%s -> %s', (relative, url) => {
    expect(boardUrlPath(PROJECT, at(relative))).toBe(url);
  });

  it('maps a partial to its folder index', () => {
    expect(folderUrlPath(PROJECT, at('charts/a/_p.yml'))).toBe('/a/');
    expect(folderUrlPath(PROJECT, at('charts/_p.yml'))).toBe('/');
  });
});

describe('chartsRelativePath', () => {
  it('returns a slash-separated project-relative path', () => {
    expect(chartsRelativePath(PROJECT, at('charts/a/b.yml'))).toBe(
      'charts/a/b.yml',
    );
    expect(chartsRelativePath('C:\\p', 'C:\\p\\charts\\b.yml')).toBe(
      'charts/b.yml',
    );
    expect(chartsRelativePath(PROJECT, '/elsewhere/a.yml')).toBeNull();
  });
});
