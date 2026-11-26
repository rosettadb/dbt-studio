import { registerDescriptor } from '../registry.shared';
import type { ConnectionDescriptor } from './descriptor.shared';
import type { ConnectionUi } from './ui.renderer';

/**
 * The UI of every database known in this window: Studio's own, in
 * CONNECTION_TYPES order, then the ones extensions added. Every lookup below
 * reads this.
 */
const registeredUis = new Map<string, ConnectionUi<any>>();

/**
 * Adds the UI of a database. Studio's own and those of extensions come in
 * through this one call. An extension gives the descriptor with it (the
 * window needs it for the label, the secrets and the SQL rules). Returns the
 * function that takes both out again. A type that is already taken is
 * refused.
 */
export function registerConnectionUi(
  ui: ConnectionUi<any>,
  descriptor?: ConnectionDescriptor,
): () => void {
  const type = ui.type as string;
  if (descriptor && descriptor.type !== type) {
    throw new Error(
      `Connection UI "${type}" was given the descriptor of "${descriptor.type}"`,
    );
  }
  if (registeredUis.has(type)) {
    throw new Error(`Connection type "${type}" is already registered`);
  }
  const removeDescriptor = descriptor ? registerDescriptor(descriptor) : null;
  registeredUis.set(type, ui);
  return () => {
    if (registeredUis.get(type) !== ui) return;
    registeredUis.delete(type);
    removeDescriptor?.();
  };
}

export function getConnectionUi(
  type: string | null | undefined,
): ConnectionUi<any> | undefined {
  return type ? registeredUis.get(type) : undefined;
}

/** Every registered UI: Studio's own first, then the ones extensions added. */
export const listConnectionUis = (): ConnectionUi<any>[] =>
  Array.from(registeredUis.values());
