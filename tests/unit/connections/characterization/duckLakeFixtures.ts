import DuckLakeService from '../../../../src/main/services/duckLake.service';
import DuckLakeInstanceStore from '../../../../src/main/services/duckLake/instanceStore.service';

const instances: Record<string, any> = {
  'inst-s3': {
    id: 'inst-s3',
    dataPath: 's3://bucket/lake',
    catalog: { type: 'duckdb', duckdb: { metadataPath: '/meta/s3.duckdb' } },
    storage: { type: 's3' },
  },
  'inst-local': {
    id: 'inst-local',
    dataPath: '/data/lake',
    catalog: { type: 'sqlite', sqlite: { metadataPath: '/meta/local.sqlite' } },
    storage: { type: 'local' },
  },
};

/** Makes the mocked DuckLake services answer for the two fixture instances. */
export const installDuckLakeInstances = () => {
  (DuckLakeService.getInstance as jest.Mock).mockImplementation(
    async (id: string) => instances[id],
  );
  (DuckLakeInstanceStore.retrieveCredentials as jest.Mock).mockImplementation(
    async (id: string) =>
      id === 'inst-s3'
        ? {
            storage: {
              type: 's3',
              s3: {
                region: 'eu-west-1',
                accessKeyId: 'AK',
                secretAccessKey: 'SK',
              },
            },
          }
        : { storage: { type: 'local' } },
  );
};
