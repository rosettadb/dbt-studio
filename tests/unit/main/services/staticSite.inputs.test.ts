/**
 * StaticSiteService.build — pages with Plan 97 inputs are exported with the
 * filters' default values baked into every query.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const mockListPages = jest.fn();
const mockExecute = jest.fn();

jest.mock('electron', () => ({
  app: { getAppPath: jest.fn(() => '/mock/app/path') },
  BrowserWindow: jest.fn(),
  shell: { openPath: jest.fn() },
  dialog: { showOpenDialog: jest.fn() },
}));

jest.mock('../../../../src/main/services/analyticsPages.service', () => ({
  AnalyticsPagesService: {
    list: (...args: any[]) => mockListPages(...args),
  },
}));

jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    executeQueryForConnection: (...args: any[]) => mockExecute(...args),
  },
}));
jest.mock('../../../../src/main/services/mainDatabase.service', () => ({
  __esModule: true,
  default: { upsertStaticSiteState: jest.fn(), getStaticSiteState: jest.fn() },
}));
jest.mock('../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: { loadSettings: jest.fn(async () => ({ theme: 'light' })) },
}));
jest.mock('../../../../src/main/services/duckLake.service', () => ({
  __esModule: true,
  default: {},
}));

(process as any).resourcesPath = '/mock/resources';

// eslint-disable-next-line import/first
import { StaticSiteService } from '../../../../src/extensions/analytics/main/staticSite.service';

const mockMainWindow = { webContents: { send: jest.fn() } } as any;

const PAGE = `---
title: Filtered
---

\`\`\`sql regions
select distinct region from orders
\`\`\`

<Dropdown name="region" data={regions} value="region" />
<ButtonGroup name="channel" defaultValue="Web">
  <ButtonGroupItem value="Web" />
</ButtonGroup>

\`\`\`sql sales
select * from orders where region = '\${inputs.region.value}' and channel = '\${inputs.channel.value}'
\`\`\`

\`\`\`sql broken
select '\${inputs.nope.value}'
\`\`\`
`;

let outputPath: string;

beforeEach(() => {
  jest.clearAllMocks();
  outputPath = fs.mkdtempSync(path.join(os.tmpdir(), 'static-site-inputs-'));
});

afterEach(() => {
  fs.rmSync(outputPath, { recursive: true, force: true });
});

describe('StaticSiteService.build with inputs', () => {
  it('bakes default filter values into the exported queries', async () => {
    mockListPages.mockResolvedValue([
      {
        id: 'p1',
        connectionId: 'conn-1',
        title: 'Filtered',
        routePath: '/filtered',
        markdownContent: PAGE,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    mockExecute.mockImplementation(async ({ query }: { query: string }) => ({
      success: true,
      data: query.includes('distinct region')
        ? [{ region: 'EMEA' }, { region: 'AMER' }]
        : [{ n: 1 }],
    }));

    const result = await StaticSiteService.build(mockMainWindow, {
      connectionId: 'conn-1',
      outputPath,
      overwrite: true,
    });

    expect(result.success).toBe(true);
    const queries = mockExecute.mock.calls.map((call) => call[0].query);
    expect(queries[0]).toContain('select distinct region');
    expect(queries).toContain(
      "select * from orders where region = 'EMEA' and channel = 'Web'",
    );
    // A query that reads a missing input is reported, not run.
    expect(queries.some((q: string) => q.includes('inputs.nope'))).toBe(false);

    const files = fs.readdirSync(path.join(outputPath, 'pages'));
    const html = fs.readFileSync(
      path.join(outputPath, 'pages', files[0]),
      'utf8',
    );
    expect(html).toContain('"region":{"value":"EMEA","label":"EMEA"}');
    expect(html).toContain('no input named \\"nope\\"');
  });
});
