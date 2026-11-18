import React from 'react';

export type RegisteredCommand = {
  id: string;
  label: string;
  run: () => void | Promise<void>;
};

const commands = new Map<string, RegisteredCommand>();
const listeners = new Set<() => void>();
let snapshot: RegisteredCommand[] = [];

const publish = () => {
  snapshot = Array.from(commands.values());
  listeners.forEach((listener) => listener());
};

export const subscribeCommands = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCommands = () => snapshot;

// Register only while the action's owning UI is mounted and available.
export const usePaletteCommand = (
  id: string,
  label: string,
  run: () => void | Promise<void>,
  enabled = true,
) => {
  const runRef = React.useRef(run);
  runRef.current = run;
  React.useEffect(() => {
    if (!enabled) return undefined;
    commands.set(id, { id, label, run: () => runRef.current() });
    publish();
    return () => {
      commands.delete(id);
      publish();
    };
  }, [id, label, enabled]);
};

export const usePaletteCommands = (
  items: RegisteredCommand[],
  enabled = true,
) => {
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const ids = items.map((item) => `${item.id}:${item.label}`).join('|');
  React.useEffect(() => {
    if (!enabled) return undefined;
    items.forEach((item) => {
      commands.set(item.id, {
        ...item,
        run: () =>
          itemsRef.current.find((current) => current.id === item.id)?.run(),
      });
    });
    publish();
    return () => {
      items.forEach((item) => commands.delete(item.id));
      publish();
    };
    // The latest handlers live in itemsRef; only the command list needs re-registration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, enabled]);
};
