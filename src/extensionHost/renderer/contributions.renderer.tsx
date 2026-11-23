import React from 'react';
import type {
  AppProvider,
  DashboardCard,
  EditorAction,
  FileTreeHoverPreview,
  FileTreeRowAction,
  NavigationItem,
  ProjectMenuItem,
  ScreenDefinition,
  SettingsPage,
  SlotContribution,
} from '../../extensionApi/renderer';
import {
  byOrder,
  createRegistry,
  useRegistry,
  type Registry,
} from './registry.renderer';

/**
 * The registries the shell reads. Studio's own items and extension items go
 * into the same lists; the shell does not know which is which.
 */
export const navigationItems = createRegistry<NavigationItem>({
  compare: byOrder,
});
export const screens = createRegistry<ScreenDefinition>();
export const dashboardCards = createRegistry<DashboardCard>({
  compare: byOrder,
});
export const settingsPages = createRegistry<SettingsPage>({ compare: byOrder });
export const appProviders = createRegistry<AppProvider>({ compare: byOrder });
export const editorActions = createRegistry<EditorAction>({
  compare: byOrder,
});
export const fileTreeRowActions = createRegistry<FileTreeRowAction>({
  compare: byOrder,
});
export const fileTreeHoverPreviews = createRegistry<FileTreeHoverPreview>();
export const projectMenuItems = createRegistry<ProjectMenuItem>({
  compare: byOrder,
});

const slotRegistries = new Map<string, Registry<SlotContribution>>();

/** The registry behind one named slot, created the first time it is asked for. */
export const slotRegistry = (slotId: string): Registry<SlotContribution> => {
  const existing = slotRegistries.get(slotId);
  if (existing) return existing;
  const created = createRegistry<SlotContribution>({ compare: byOrder });
  slotRegistries.set(slotId, created);
  return created;
};

/** The contributions of a slot, for screens that lay them out themselves. */
export const useSlot = <P,>(
  slotId: string,
): ReadonlyArray<SlotContribution<P>> => useRegistry(slotRegistry(slotId));

type SlotProps = {
  /** Slot id, published by the screen that renders it. */
  id: string;
  /** Passed to every contributed component and to its `when`. */
  props?: Record<string, unknown>;
};

const NO_PROPS = {};

/** Renders everything contributed to a slot, in order. */
export const Slot: React.FC<SlotProps> = ({ id, props = NO_PROPS }) => {
  const contributions = useSlot<Record<string, unknown>>(id);
  return (
    <>
      {contributions
        .filter(
          (contribution) => !contribution.when || contribution.when(props),
        )
        .map((contribution) => (
          // eslint-disable-next-line react/jsx-props-no-spreading
          <contribution.Component key={contribution.id} {...props} />
        ))}
    </>
  );
};

/**
 * Whether a sidebar item is the active one for a route: the item's route or
 * anything below it (only the route itself when the item is `exact`).
 */
export const isNavigationItemActive = (
  item: NavigationItem,
  pathname: string,
): boolean => {
  if (item.exact) return pathname === item.path;
  return (item.activePaths ?? [item.path]).some(
    (activePath) =>
      pathname === activePath || pathname.startsWith(`${activePath}/`),
  );
};
