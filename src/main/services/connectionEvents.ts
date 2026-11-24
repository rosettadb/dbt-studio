/**
 * What happens to connections, for code that keeps something per
 * connection (the Notebooks extension archives a connection's notebooks).
 */
type WillDeleteListener = (connectionId: string) => Promise<void> | void;

const willDeleteListeners = new Set<WillDeleteListener>();

/**
 * Runs before a connection (or a DuckLake instance, as `ducklake-<id>`) is
 * deleted. The deletion waits for every listener, and a listener that throws
 * stops it: nothing is deleted and the user sees the message.
 */
export function onWillDeleteConnection(
  listener: WillDeleteListener,
): () => void {
  willDeleteListeners.add(listener);
  return () => {
    willDeleteListeners.delete(listener);
  };
}

/** Called by the services that delete; rejects when a listener refuses. */
export async function emitWillDeleteConnection(
  connectionId: string,
): Promise<void> {
  await Array.from(willDeleteListeners).reduce(async (previous, listener) => {
    await previous;
    await listener(connectionId);
  }, Promise.resolve());
}
