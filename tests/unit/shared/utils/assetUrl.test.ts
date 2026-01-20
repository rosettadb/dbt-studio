import { AssetUrl } from '../../../../src/main/utils/assetUrl';

describe('AssetUrl', () => {
  it('should strip everything up to /node_modules/ from the pathname', () => {
    const assetUrl = new AssetUrl(
      'https://example.com/some/path/node_modules/@scope/pkg/file.js',
    );

    expect(assetUrl.relativeUrl).toBe('@scope/pkg/file.js');
  });

  it('should return pathname if it does not include /node_modules/', () => {
    const assetUrl = new AssetUrl('https://example.com/assets/icon.svg');

    expect(assetUrl.relativeUrl).toBe('/assets/icon.svg');
  });
});
