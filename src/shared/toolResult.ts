type ToolResultEnvelope = {
  ok?: unknown;
  success?: unknown;
  error?: unknown;
  data?: {
    error?: unknown;
  };
};

const asEnvelope = (result: unknown): ToolResultEnvelope | null => {
  if (!result || typeof result !== 'object') return null;
  return result as ToolResultEnvelope;
};

export const isToolResultFailure = (result: unknown): boolean => {
  const envelope = asEnvelope(result);
  return envelope?.ok === false || envelope?.success === false;
};

export const getToolResultError = (result: unknown): string | undefined => {
  const envelope = asEnvelope(result);
  if (!envelope) return undefined;
  const error = envelope.error ?? envelope.data?.error;
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error) return error.message;
  return undefined;
};
