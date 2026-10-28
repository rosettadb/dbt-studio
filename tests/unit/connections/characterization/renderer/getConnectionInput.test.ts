import { getConnectionInput } from '../../../../../src/renderer/helpers/utils';
import { ALL_TYPES, FIXTURES, LEGACY_DB2, allFixtures } from '../fixtures';

describe('getConnectionInput characterization', () => {
  allFixtures(ALL_TYPES).forEach(({ type, label, conn }) => {
    it(`${type} (${label})`, () => {
      expect(
        getConnectionInput({ id: '1', connection: conn }),
      ).toMatchSnapshot();
    });
  });

  it('ducklake has no mapping (undefined)', () => {
    expect(
      getConnectionInput({ id: '1', connection: FIXTURES.ducklake[0].conn }),
    ).toBeUndefined();
  });

  it('legacy db2 has no mapping (undefined)', () => {
    expect(
      getConnectionInput({ id: '1', connection: LEGACY_DB2 }),
    ).toBeUndefined();
  });

  it('a missing connection model returns undefined', () => {
    expect(getConnectionInput(undefined as any)).toBeUndefined();
  });
});
