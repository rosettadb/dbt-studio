import {
  buildKineticaUrl,
  parseKineticaUrl,
} from '../../../src/shared/kineticaUrl';

describe('buildKineticaUrl', () => {
  it('builds an http URL from a bare host and port', () => {
    expect(buildKineticaUrl({ host: '192.168.1.100', port: 9191 })).toBe(
      'http://192.168.1.100:9191',
    );
  });

  it('switches to https when SSL is enabled', () => {
    expect(
      buildKineticaUrl({
        host: 'kinetica.example.com',
        port: 8082,
        useSSL: true,
      }),
    ).toBe('https://kinetica.example.com:8082');
  });

  it('keeps a Kinetica Cloud path and drops the port when the host carries one', () => {
    expect(
      buildKineticaUrl({
        host: 'tenant.kinetica.com:443/cluster-1/gpudb-0',
        port: 9191,
        useSSL: true,
      }),
    ).toBe('https://tenant.kinetica.com/cluster-1/gpudb-0');
  });

  it('forces the scheme from the SSL flag even when the host has one', () => {
    expect(
      buildKineticaUrl({
        host: 'http://kinetica.local',
        port: 9191,
        useSSL: true,
      }),
    ).toBe('https://kinetica.local:9191');
  });
});

describe('parseKineticaUrl', () => {
  it('round-trips a URL with a path', () => {
    const parsed = parseKineticaUrl(
      'https://tenant.kinetica.com/cluster-1/gpudb-0',
    );
    expect(parsed).toEqual({
      host: 'tenant.kinetica.com/cluster-1/gpudb-0',
      port: 443,
      useSSL: true,
    });
    expect(buildKineticaUrl(parsed)).toBe(
      'https://tenant.kinetica.com/cluster-1/gpudb-0',
    );
  });

  it('defaults to the http port when none is given', () => {
    expect(parseKineticaUrl('http://localhost')).toEqual({
      host: 'localhost',
      port: 9191,
      useSSL: false,
    });
  });
});
