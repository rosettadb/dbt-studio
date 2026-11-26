import type { Notebook } from '../../types/notebooks';

/**
 * Who can list the notebooks of a connection. The Notebooks extension
 * answers while it runs; without it there are no notebooks to list.
 */
type NotebookLister = (connectionId: string) => Promise<Notebook[]>;

let currentLister: NotebookLister | null = null;

/** Sets who lists notebooks. Returns the function that takes it back. */
export function setNotebookLister(lister: NotebookLister): () => void {
  currentLister = lister;
  return () => {
    if (currentLister === lister) currentLister = null;
  };
}

/** The notebooks of a connection, for Studio code that reports on them. */
export const listNotebooksOfConnection: NotebookLister = async (
  connectionId,
) => (currentLister ? currentLister(connectionId) : []);
