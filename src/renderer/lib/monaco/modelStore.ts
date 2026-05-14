import * as monaco from 'monaco-editor';
import { buildModelUri } from './uri';

const models = new Map<string, monaco.editor.ITextModel>();

/**
 * Return the model for `(projectId, filePath)`, creating it on first call.
 * Subsequent calls with the same key return the same model — undo history
 * therefore survives tab switches.
 */
export const getOrCreateModel = (
  projectId: string | undefined,
  filePath: string,
  initialContent: string,
  language: string,
): monaco.editor.ITextModel => {
  const uri = buildModelUri(projectId, filePath);
  const key = uri.toString();

  const tracked = models.get(key);
  if (tracked) return tracked;

  // Adopt any model Monaco still holds for this URI from a prior lifecycle
  // (HMR, project switch) instead of failing to create a duplicate.
  const existing = monaco.editor.getModel(uri);
  const model =
    existing ?? monaco.editor.createModel(initialContent, language, uri);
  models.set(key, model);
  return model;
};

/**
 * Dispose the model for the given path and drop it from the store.
 * Call this on tab close.
 */
export const disposeModelForPath = (
  projectId: string | undefined,
  filePath: string,
): void => {
  const uri = buildModelUri(projectId, filePath);
  const key = uri.toString();
  const model = models.get(key);
  if (model) {
    model.dispose();
    models.delete(key);
    return;
  }
  monaco.editor.getModel(uri)?.dispose();
};

/**
 * Move a model from one path to another while preserving its content.
 * Monaco does not allow a model's URI to change in place, so the model is
 * recreated under the new URI and the old one disposed.
 */
export const renameModel = (
  projectId: string | undefined,
  oldPath: string,
  newPath: string,
  language: string,
): void => {
  const oldUri = buildModelUri(projectId, oldPath);
  const newUri = buildModelUri(projectId, newPath);
  const oldKey = oldUri.toString();
  const newKey = newUri.toString();
  if (oldKey === newKey) return;
  const oldModel = models.get(oldKey);
  if (!oldModel) return;
  const content = oldModel.getValue();
  oldModel.dispose();
  models.delete(oldKey);
  const newModel = monaco.editor.createModel(content, language, newUri);
  models.set(newKey, newModel);
};

/** Dispose every tracked model. Used on full app teardown. */
export const disposeAllModels = (): void => {
  models.forEach((m) => m.dispose());
  models.clear();
};
