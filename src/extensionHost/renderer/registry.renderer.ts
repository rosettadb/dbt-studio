import React from 'react';
import { toDisposable, type Disposable } from '../shared/protocol.shared';

/**
 * One ordered, observable list of contributions. Every place an extension
 * can add something (sidebar items, screens, file views, panels, ...) is one
 * of these. Adding returns a disposer, so a contribution can always be taken
 * out again, and React components re-render when the list changes.
 */
export interface Registry<T extends { id: string }> {
  /**
   * Adds an item. An item with an id that is already present replaces the
   * old one in place. The disposer removes the item, unless it has been
   * replaced in the meantime.
   */
  add: (item: T) => Disposable;
  /** Current items in display order. The array is replaced on every change. */
  list: () => ReadonlyArray<T>;
  get: (id: string) => T | undefined;
  subscribe: (listener: () => void) => () => void;
}

export interface RegistryOptions<T> {
  /**
   * Display order. Items that compare equal keep the order they were added
   * in. Without it the list is in insertion order.
   */
  compare?: (a: T, b: T) => number;
}

export const createRegistry = <T extends { id: string }>(
  options: RegistryOptions<T> = {},
): Registry<T> => {
  const { compare } = options;
  const items: T[] = [];
  const listeners = new Set<() => void>();
  let snapshot: ReadonlyArray<T> = [];

  const publish = () => {
    // Array.prototype.sort is stable, so equal items stay in insertion order.
    snapshot = compare ? [...items].sort(compare) : [...items];
    listeners.forEach((listener) => listener());
  };

  return {
    add: (item) => {
      const existing = items.findIndex((current) => current.id === item.id);
      if (existing >= 0) {
        items[existing] = item;
      } else {
        items.push(item);
      }
      publish();
      return toDisposable(() => {
        const index = items.indexOf(item);
        if (index < 0) return;
        items.splice(index, 1);
        publish();
      });
    },
    list: () => snapshot,
    get: (id) => items.find((item) => item.id === id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/** Lower `order` first; items without an order come after those with one. */
export const byOrder = <T extends { order?: number }>(a: T, b: T): number =>
  (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);

/** Subscribes a component to a registry and returns its current items. */
export const useRegistry = <T extends { id: string }>(
  registry: Registry<T>,
): ReadonlyArray<T> =>
  React.useSyncExternalStore(registry.subscribe, registry.list, registry.list);
