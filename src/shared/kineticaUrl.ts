/**
 * Builds the full head-node URL used by every Kinetica client in the Studio
 * (the native GPUdb driver, the Rosetta JDBC URL and the dbt-kinetica `host`).
 *
 * The connection form accepts either a bare host (`192.168.1.100`), a host with
 * a path (`my-kinetica.com/cluster-1/gpudb-0`, required for Kinetica Cloud) or
 * a full URL. The scheme always follows the `useSSL` flag and the explicit port
 * is only appended when the host itself does not carry one.
 */
export type KineticaUrlParts = {
  host: string;
  port?: number | string | null;
  useSSL?: boolean;
};

export const DEFAULT_KINETICA_HTTP_PORT = 9191;

export function buildKineticaUrl({
  host,
  port,
  useSSL,
}: KineticaUrlParts): string {
  const protocol = useSSL ? 'https:' : 'http:';
  const trimmed = (host ?? '').trim();
  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${protocol}//${trimmed}`;

  // `URL` reports an empty `port` when the input carries the scheme's default
  // (e.g. `tenant:443` over https), so detect an explicit authority port in
  // the raw string instead. The form port only applies when there is none.
  const hasExplicitPort = /^https?:\/\/[^/?#]*:\d+(?=[/?#]|$)/i.test(
    normalized,
  );

  const urlObj = new URL(normalized);
  urlObj.protocol = protocol;
  if (!hasExplicitPort && port) {
    urlObj.port = String(port);
  }

  const portPart = urlObj.port ? `:${urlObj.port}` : '';
  const pathPart = urlObj.pathname === '/' ? '' : urlObj.pathname;
  return `${urlObj.protocol}//${urlObj.hostname}${portPart}${pathPart}`;
}

/**
 * Inverse of {@link buildKineticaUrl}; used when importing an existing
 * dbt-kinetica profile into a Studio connection.
 */
export function parseKineticaUrl(url: string): {
  host: string;
  port: number;
  useSSL: boolean;
} {
  const urlObj = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`);
  const useSSL = urlObj.protocol === 'https:';
  const pathPart = urlObj.pathname === '/' ? '' : urlObj.pathname;
  const fallbackPort = useSSL ? 443 : DEFAULT_KINETICA_HTTP_PORT;
  return {
    host: `${urlObj.hostname}${pathPart}`,
    port: urlObj.port ? Number(urlObj.port) : fallbackPort,
    useSSL,
  };
}
