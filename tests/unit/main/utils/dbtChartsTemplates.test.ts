import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import {
  createDbtChartsBoard,
  listDbtChartsBoards,
  setupDbtChartsProject,
} from '../../../../src/main/utils/dbtChartsTemplates';

describe('dbtChartsTemplates', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-charts-tpl-'));
    await fs.writeFile(
      path.join(dir, 'dbt_project.yml'),
      'name: shop\nprofile: shop_profile\n',
    );
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('setupProject writes dbt_profile config and a starter index board', async () => {
    const { configPath, indexPath } = await setupDbtChartsProject(dir, 'Shop');
    const config = yaml.load(await fs.readFile(configPath, 'utf8')) as any;
    expect(config.sources).toEqual({
      shop: {
        type: 'dbt_profile',
        profile: 'shop_profile',
        target: 'dev',
      },
    });
    const index = yaml.load(await fs.readFile(indexPath, 'utf8')) as any;
    expect(index.source).toBe('shop');
    expect(index.queries.sample.type).toBe('values');
    expect(index.rows).toEqual(['orders_by_month']);
    expect(indexPath).toBe(path.join(dir, 'charts', 'index.yml'));
  });

  it('setupProject refuses when either file exists', async () => {
    await setupDbtChartsProject(dir, 'Shop');
    await expect(setupDbtChartsProject(dir, 'Shop')).rejects.toThrow(
      /already set up/,
    );
    await fs.remove(path.join(dir, 'dbt_charts.yml'));
    await expect(setupDbtChartsProject(dir, 'Shop')).rejects.toThrow(
      /already set up/,
    );
  });

  it('createBoard writes charts/{slug}.yml with the same source', async () => {
    await setupDbtChartsProject(dir, 'Shop');
    const { path: boardPath } = await createDbtChartsBoard(dir, 'Sales Q1');
    expect(boardPath).toBe(path.join(dir, 'charts', 'sales-q1.yml'));
    const board = yaml.load(await fs.readFile(boardPath, 'utf8')) as any;
    expect(board.title).toBe('Sales Q1');
    expect(board.charts.orders_by_month.query).toBe('sample');
  });

  it('createBoard refuses existing boards', async () => {
    await setupDbtChartsProject(dir, 'Shop');
    await createDbtChartsBoard(dir, 'sales');
    await expect(createDbtChartsBoard(dir, 'sales')).rejects.toThrow(
      /already exists/,
    );
    await expect(createDbtChartsBoard(dir, 'index')).rejects.toThrow(
      /already exists/,
    );
  });

  it.each(['../evil', 'a/../../evil', '/etc/passwd', '..', ''])(
    'createBoard refuses paths outside charts/: %p',
    async (name) => {
      await setupDbtChartsProject(dir, 'Shop');
      await expect(createDbtChartsBoard(dir, name)).rejects.toThrow();
      expect(await fs.pathExists(path.join(dir, 'evil.yml'))).toBe(false);
    },
  );

  it('createBoard requires dbt Charts to be set up first', async () => {
    await expect(createDbtChartsBoard(dir, 'sales')).rejects.toThrow(
      /not set up/,
    );
  });

  it('lists boards relative to the project root', async () => {
    await setupDbtChartsProject(dir, 'Shop');
    await createDbtChartsBoard(dir, 'team/sales');
    expect(await listDbtChartsBoards(dir)).toEqual([
      'charts/index.yml',
      'charts/team/sales.yml',
    ]);
  });
});
