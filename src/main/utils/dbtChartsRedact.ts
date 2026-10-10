export type ChartsEnv = Record<string, string | undefined>;

export const SECRET_PREFIX = 'db-';

// Values read from secure storage in this process (e.g. a BigQuery key that is
// materialized to a file and never lands in process.env).
const knownSecrets = new Set<string>();

export function rememberSecret(value: string) {
  knownSecrets.add(value);
  // Service-account JSON: also hide the private key on its own.
  try {
    const parsed = JSON.parse(value) as { private_key?: unknown };
    if (typeof parsed.private_key === 'string' && parsed.private_key) {
      knownSecrets.add(parsed.private_key);
    }
  } catch {
    // not JSON
  }
}

function collectSecrets(env?: ChartsEnv): string[] {
  const values = new Set<string>(knownSecrets);
  const source = env ?? process.env;
  Object.entries(source).forEach(([key, value]) => {
    if (key.startsWith(SECRET_PREFIX) && value) values.add(value);
  });
  // Longest first so a secret containing another is replaced whole.
  return [...values].sort((a, b) => b.length - a.length);
}

/** Replaces every db-* secret value found in `text` with ***. */
export function redactSecrets(text: string, env?: ChartsEnv): string {
  return collectSecrets(env).reduce(
    (acc, secret) => acc.split(secret).join('***'),
    text,
  );
}

/** Test helper. */
export function clearKnownSecrets() {
  knownSecrets.clear();
}
