import './mocks';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import ConnectorsService from '../../../../src/main/services/connectors.service';
import { updateProfilesYml } from '../../../../src/main/utils/yamlPartialUpdate';
import {
  DBT_TYPES,
  allFixtures,
  cleanTempProjects,
  makeTempProject,
} from './fixtures';

// Fixtures whose partial update differs from a full regeneration today.
const DIFF_TAGS: Record<string, string> = {
  'postgres:ssl on, reject unauthorized false': 'DIFF-1',
  'redshift:ssl on with sslrootcert': 'DIFF-2',
  'snowflake:oauth_browser without role': 'DIFF-3',
  'bigquery:service account, no location': 'DIFF-4',
  'bigquery:location and batch priority': 'DIFF-4',
};

describe('generateProfilesYml characterization', () => {
  afterEach(cleanTempProjects);

  allFixtures(DBT_TYPES.filter((t) => t !== 'ducklake')).forEach(
    ({ type, label, conn }) => {
      it(`${type} (${label}): full text`, async () => {
        const text = await ConnectorsService.generateProfilesYml('proj', conn);
        expect(text).toMatchSnapshot();
        expect(text).not.toContain('FIXTURE-SECRET');
      });

      it(`${type} (${label}): partial update vs full`, async () => {
        const dir = makeTempProject();
        const full = await ConnectorsService.generateProfilesYml('proj', conn);
        const tag = DIFF_TAGS[`${type}:${label}`];
        // DIFF-1/-2: seed from the ssl-off shape, as when ssl is switched on.
        const seed =
          tag === 'DIFF-1' || tag === 'DIFF-2'
            ? await ConnectorsService.generateProfilesYml('proj', {
                ...conn,
                ssl: false,
              } as any)
            : full;
        fs.writeFileSync(path.join(dir, 'profiles.yml'), seed);
        await updateProfilesYml(dir, 'proj', conn);
        // Partial updates keep the existing `threads`, so compare without it.
        const { threads: partialThreads, ...partial } = (
          yaml.load(
            fs.readFileSync(path.join(dir, 'profiles.yml'), 'utf8'),
          ) as any
        ).proj.outputs.dev;
        const { threads, ...fullOutput } = (yaml.load(full) as any).proj
          .outputs.dev;
        if (tag) {
          // ${tag}: today's partial output differs from the full output.
          expect({ tag, partial }).toMatchSnapshot();
        } else {
          expect(partial).toEqual(fullOutput);
        }
        expect(partialThreads).toBe(threads);
      });
    },
  );
});
