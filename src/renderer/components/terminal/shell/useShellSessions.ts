import React from 'react';
import { toast } from 'react-toastify';
import type { Project } from '../../../../types/backend';
import type { PtySessionInfo } from '../../../../types/pty';
import { shellSessions } from './shellSessions';
import type { ShellSessionsState } from './shellSessions';

const DEFAULT_PROFILE_KEY = 'shellTerminal.defaultProfileId';

/** Shell the user picked as their default in the "+" menu (per machine). */
export const getPreferredProfileId = (): string | null => {
  try {
    return window.localStorage.getItem(DEFAULT_PROFILE_KEY);
  } catch {
    return null;
  }
};

export const setPreferredProfileId = (profileId: string): void => {
  try {
    window.localStorage.setItem(DEFAULT_PROFILE_KEY, profileId);
  } catch {
    // Storage unavailable: the choice simply does not persist.
  }
};

export const useShellSessionsState = (): ShellSessionsState =>
  React.useSyncExternalStore(shellSessions.subscribe, shellSessions.getState);

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : 'The terminal could not be started.';

/**
 * Opens a shell in the project folder. Without an explicit profile the
 * user's preferred shell is used when it still exists on this machine,
 * otherwise the system default.
 */
export const openShellSession = async (
  project: Project,
  profileId?: string,
): Promise<PtySessionInfo | null> => {
  try {
    let resolved = profileId;
    if (!resolved) {
      const preferred = getPreferredProfileId();
      if (preferred) {
        const { profiles } = await shellSessions.getProfiles();
        if (profiles.some((profile) => profile.id === preferred)) {
          resolved = preferred;
        }
      }
    }
    return await shellSessions.create(project.id, project.path, resolved);
  } catch (error) {
    toast.error(errorMessage(error));
    return null;
  }
};

/** Sessions of one project plus the selected one. */
export const useProjectShellSessions = (project: Project) => {
  const state = useShellSessionsState();
  return React.useMemo(() => {
    const sessions = state.sessions.filter(
      (session) => session.projectId === project.id,
    );
    const activeId = state.activeByProject[project.id];
    const active =
      sessions.find((session) => session.id === activeId) ??
      sessions[sessions.length - 1];
    return { sessions, active, ready: state.ready };
  }, [state, project.id]);
};
