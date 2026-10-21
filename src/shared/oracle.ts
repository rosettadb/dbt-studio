/* eslint-disable no-control-regex, no-restricted-syntax */
import type { OracleConnection } from '../types/backend';

export const ORACLE_DEFAULT_PORT = 1521;
export const ORACLE_DEFAULT_TLS_PORT = 2484;
export const ORACLE_MIN_VERSION = [12, 1] as const;
const control = /[\u0000-\u001f\u007f]/;
const simpleName = /^[A-Za-z0-9._-]+$/;

export function validateOracleConnection(
  conn: OracleConnection,
): string | null {
  if (
    Object.values(conn).some(
      (value) => typeof value === 'string' && control.test(value),
    )
  )
    return 'Oracle fields cannot contain control characters or newlines';
  if (!conn.username?.trim()) return 'Username is required';
  switch (conn.connectMode) {
    case 'basic':
      if (
        !conn.host ||
        !/^(?:[A-Za-z0-9._-]+|\[[A-Fa-f0-9:.]+\])$/.test(conn.host)
      )
        return 'Enter a valid host or bracketed IPv6 address';
      if (!Number.isInteger(conn.port) || conn.port! < 1 || conn.port! > 65535)
        return 'Port must be an integer between 1 and 65535';
      if (!simpleName.test(conn.serviceName || ''))
        return 'A valid service name is required';
      break;
    case 'connectString': {
      const value = conn.connectString?.trim() || '';
      if (!value) return 'Connect string is required';
      if (
        /^[^()@\s]+\/[^()@\s]*@/.test(value) ||
        /\b(?:PASSWORD|USER(?:NAME)?)\s*=/i.test(value) ||
        /:\/\/[^/\s]*@/.test(value)
      )
        return 'Connect strings cannot contain credentials';
      if (value.startsWith('(')) {
        let depth = 0;
        for (const char of value) {
          if (char === '(') depth += 1;
          if (char === ')') depth -= 1;
          if (depth < 0)
            return 'Connect descriptor parentheses must be balanced';
        }
        if (depth !== 0)
          return 'Connect descriptor parentheses must be balanced';
      }
      break;
    }
    case 'wallet':
      if (!conn.walletDir?.trim()) return 'Wallet folder is required';
      if (!simpleName.test(conn.connectString || ''))
        return 'A valid TNS alias is required';
      break;
    default:
      return 'Choose an Oracle connection mode';
  }
  return null;
}

export function normalizeOracleIdentifier(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replace(/""/g, '"')
    : trimmed.toUpperCase();
}

export function buildOracleEasyConnect(conn: OracleConnection): string {
  return `${conn.tls ? 'tcps://' : ''}${conn.host}:${conn.port}/${conn.serviceName}`;
}

export function parseOracleVersion(version: string): [number, number] | null {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function isSupportedOracleVersion(version: string): boolean {
  const parsed = parseOracleVersion(version);
  return !!parsed && (parsed[0] > 12 || (parsed[0] === 12 && parsed[1] >= 1));
}

export function scrubOracleSecrets(
  message: string,
  secrets: (string | undefined)[],
): string {
  return secrets
    .filter((secret): secret is string => !!secret)
    .sort((a, b) => b.length - a.length)
    .reduce((text, secret) => text.split(secret).join('[redacted]'), message);
}

/** Only names at descriptor depth zero; never exposes wallet file contents. */
export function parseOracleWalletAliases(text: string): string[] {
  const aliases = new Set<string>();
  let depth = 0;
  let quoted = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '');
    if (depth === 0) {
      const match = /^\s*([A-Za-z0-9._-]+(?:\s*,\s*[A-Za-z0-9._-]+)*)\s*=/.exec(
        line,
      );
      match?.[1].split(',').forEach((alias) => aliases.add(alias.trim()));
    }
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      if (!quoted && char === '(') depth += 1;
      if (!quoted && char === ')') depth -= 1;
    }
    if (depth < 0) throw new Error('Invalid tnsnames.ora descriptor');
  }
  if (depth !== 0 || quoted) throw new Error('Invalid tnsnames.ora descriptor');
  return [...aliases];
}

/** Explicit allowlist: secrets and inactive mode fields never reach the store. */
export function prepareOracleConnection(
  conn: OracleConnection,
): OracleConnection {
  return {
    type: 'oracle',
    name: conn.name,
    username: conn.username.trim(),
    password: '',
    database: conn.database,
    schema: normalizeOracleIdentifier(conn.schema || conn.username),
    connectMode: conn.connectMode,
    ...(conn.connectMode === 'basic'
      ? {
          host: conn.host,
          port: conn.port,
          serviceName: conn.serviceName,
          tls: !!conn.tls,
        }
      : { connectString: conn.connectString?.trim() }),
    ...(conn.connectMode === 'wallet' ? { walletDir: conn.walletDir } : {}),
  };
}

const codeSql = (sql: string) =>
  sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '').trim();
export const isOraclePlSql = (sql: string) =>
  /^(?:BEGIN\b|DECLARE\b|CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?:PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE)\b)/i.test(
    codeSql(sql),
  );
