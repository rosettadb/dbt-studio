/**
 * Serializes any thrown value (Error, plain object, string, etc.) into a
 * structured, JSON-safe shape so the full error can survive the IPC boundary.
 *
 * Electron's IPC only transfers an Error's `message`/`stack` and drops custom
 * properties, so rich errors (API responses, objects passed to `new Error(obj)`)
 * arrive in the renderer as "[object Object]". We encode everything we can into
 * a single JSON string that travels as the message of a fresh Error.
 */

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  /** Own enumerable properties not already covered above (status, code, body, ...). */
  data?: Record<string, unknown>;
  /** Recursively serialized `cause`, when present. */
  cause?: SerializedError;
}

const PREFIX = '__SERIALIZED_ERROR__:';

const RESERVED = new Set(['name', 'message', 'stack', 'cause']);

/** Property names that commonly hold the real error text on rich error objects. */
const MESSAGE_KEYS = [
  'message',
  'error',
  'detail',
  'details',
  'reason',
  'description',
  'responseBody',
  'body',
  'statusText',
];

/** Messages that carry no information and should trigger a deeper lookup. */
const isUninformative = (msg: unknown): boolean =>
  typeof msg !== 'string' ||
  msg.trim() === '' ||
  msg === '[object Object]' ||
  msg === '{}';

const safeStringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value);
    return json && json !== '{}' ? json : String(value);
  } catch {
    return String(value);
  }
};

/**
 * Collects own properties (including non-enumerable ones, since Error fields
 * are non-enumerable) other than the reserved name/message/stack/cause, so that
 * status codes, response bodies, urls, etc. survive serialization.
 */
const collectExtraData = (
  value: object,
): Record<string, unknown> | undefined => {
  const data: Record<string, unknown> = {};
  Object.getOwnPropertyNames(value)
    .filter((key) => !RESERVED.has(key))
    .forEach((key) => {
      const prop = (value as Record<string, unknown>)[key];
      if (typeof prop === 'function') return;
      try {
        // Round-trip to drop anything non-cloneable / circular.
        data[key] = JSON.parse(JSON.stringify(prop));
      } catch {
        data[key] = String(prop);
      }
    });
  return Object.keys(data).length > 0 ? data : undefined;
};

/**
 * Best-effort extraction of a human-readable message from an arbitrary value by
 * probing the keys that error libraries (AI SDK, fetch, axios, ...) tend to use.
 */
const deriveMessage = (value: unknown, depth = 0): string => {
  if (typeof value === 'string') return value;
  if (value == null) return 'Unknown error';
  if (typeof value !== 'object') return String(value);
  if (depth > 4) return safeStringify(value);

  const obj = value as Record<string, unknown>;
  // eslint-disable-next-line no-restricted-syntax
  for (const key of MESSAGE_KEYS) {
    const candidate = obj[key];
    if (typeof candidate === 'string' && !isUninformative(candidate)) {
      return candidate;
    }
    if (candidate != null && typeof candidate === 'object') {
      const nested = deriveMessage(candidate, depth + 1);
      if (!isUninformative(nested)) return nested;
    }
  }
  return safeStringify(value);
};

/**
 * Derives a message from `source`, falling back to the first line of the error's
 * stack and finally a generic string, so we never surface "{}" / "[object Object]".
 */
const deriveMessageWithFallback = (source: unknown, err: Error): string => {
  if (source != null) {
    const derived = deriveMessage(source);
    if (!isUninformative(derived)) return derived;
  }
  const firstStackLine = err.stack?.split('\n')[0]?.trim();
  if (firstStackLine && !isUninformative(firstStackLine)) {
    // Strip a leading "Error: [object Object]" that carries no info.
    const cleaned = firstStackLine.replace(/^Error:\s*/, '');
    if (!isUninformative(cleaned)) return firstStackLine;
  }
  return `${err.name || 'Error'} (no message available)`;
};

export const serializeError = (err: unknown, depth = 0): SerializedError => {
  if (err instanceof Error) {
    const rawCause = (err as { cause?: unknown }).cause;
    const cause =
      depth < 3 && rawCause != null
        ? serializeError(rawCause, depth + 1)
        : undefined;
    const data = collectExtraData(err);
    return {
      name: err.name || 'Error',
      // Guard the `new Error(obj)` => "[object Object]"/empty-message cases by
      // looking through cause and own data for the real text.
      message: isUninformative(err.message)
        ? deriveMessageWithFallback(rawCause ?? data, err)
        : err.message,
      stack: err.stack,
      data,
      cause,
    };
  }

  if (err != null && typeof err === 'object') {
    const rawCause = (err as { cause?: unknown }).cause;
    return {
      name: (err as { name?: string }).name || 'Error',
      message: deriveMessage(err),
      data: collectExtraData(err),
      cause:
        depth < 3 && rawCause != null
          ? serializeError(rawCause, depth + 1)
          : undefined,
    };
  }

  return {
    name: 'Error',
    message: err == null ? 'Unknown error' : String(err),
  };
};

/**
 * Normalizes any thrown value into a real `Error` while preserving the original
 * message and structured fields. Use this instead of `new Error(String(value))`
 * when an SDK/library throws or emits a plain error object, so the real message
 * ("context_length_exceeded ...") is not flattened to "[object Object]".
 */
export const toError = (value: unknown): Error => {
  if (value instanceof Error) return value;

  const serialized = serializeError(value);
  const error = new Error(serialized.message);
  error.name = serialized.name;
  // Keep the original payload accessible for callers that want the raw fields.
  Object.assign(error, {
    ...(serialized.data ?? {}),
    cause: value,
  });
  return error;
};

/**
 * Encodes an error into a string suitable for throwing across IPC. The renderer
 * decodes it with {@link parseSerializedError}.
 */
export const encodeError = (err: unknown): string =>
  PREFIX + JSON.stringify(serializeError(err));

/**
 * Decodes a string produced by {@link encodeError}. Returns `null` if the input
 * is not an encoded serialized error (e.g. a plain message string).
 */
export const parseSerializedError = (
  message: string | undefined | null,
): SerializedError | null => {
  if (!message || !message.startsWith(PREFIX)) return null;
  try {
    return JSON.parse(message.slice(PREFIX.length)) as SerializedError;
  } catch {
    return null;
  }
};

export const SERIALIZED_ERROR_PREFIX = PREFIX;
