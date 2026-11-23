import type { ExtensionRendererModule } from '../../extensionApi/renderer';
import type { ExtensionDescription } from '../shared/manifest.shared';
import { EXTENSION_SCHEME } from '../shared/protocol.shared';
import { getSharedModule, hasSharedModule } from './sharedModules.renderer';

/**
 * Loads the UI half of an installed extension.
 *
 * The extension's renderer file is a plain script in AMD shape. It calls
 *
 *   window.rosettaStudio.define(name, ['react', '@rosetta/studio-api'], factory)
 *
 * The host loads the script from the extension's folder, resolves the listed
 * names to its own copies of those libraries, and calls the factory, which
 * returns the module that exports `activate`. Nothing is evaluated from a
 * string.
 */
type Factory = (...dependencies: unknown[]) => unknown;

interface Definition {
  dependencies: string[];
  factory: Factory;
}

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    rosettaStudio?: { define: (...args: unknown[]) => void };
  }
}

// Definitions made by scripts that have run but are not picked up yet.
const pendingDefinitions = new Map<string, Definition>();

const ensureGlobal = (): void => {
  if (window.rosettaStudio) return;
  window.rosettaStudio = {
    // define(name?, dependencies?, factory)
    define: (...args: unknown[]) => {
      const factory = args[args.length - 1];
      const dependencies = args.find((arg) => Array.isArray(arg)) as
        | string[]
        | undefined;
      const script = document.currentScript as HTMLScriptElement | null;
      const extensionId = script?.dataset.extensionId;
      if (!extensionId || typeof factory !== 'function') return;
      pendingDefinitions.set(extensionId, {
        dependencies: dependencies ?? [],
        factory: factory as Factory,
      });
    },
  };
};

const instantiate = (
  extensionId: string,
  definition: Definition,
): ExtensionRendererModule => {
  const moduleObject: { exports: Record<string, unknown> } = { exports: {} };
  const resolve = (name: string): unknown => {
    if (name === 'exports') return moduleObject.exports;
    if (name === 'module') return moduleObject;
    if (name === 'require') return resolve;
    if (!hasSharedModule(name)) {
      throw new Error(
        `Extension ${extensionId} needs "${name}", which Studio does not provide. Bundle it into the extension.`,
      );
    }
    return getSharedModule(name);
  };

  const returned = definition.factory(...definition.dependencies.map(resolve));
  const loaded = (returned ?? moduleObject.exports) as any;
  const module: ExtensionRendererModule =
    typeof loaded?.activate === 'function' ? loaded : loaded?.default;
  if (typeof module?.activate !== 'function') {
    throw new Error(`Extension ${extensionId} does not export activate()`);
  }
  return module;
};

export const loadExtensionModule = (
  description: ExtensionDescription,
): Promise<ExtensionRendererModule> => {
  const { id, manifest } = description;
  if (!manifest.renderer) {
    return Promise.reject(new Error(`Extension ${id} has no renderer entry`));
  }
  ensureGlobal();

  const entry = manifest.renderer.replace(/\\/g, '/').replace(/^\.?\//, '');
  // The version in the url keeps a new install from being served from cache.
  const src = `${EXTENSION_SCHEME}://${id}/${entry}?v=${encodeURIComponent(
    manifest.version,
  )}`;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.extensionId = id;
    script.onload = () => {
      const definition = pendingDefinitions.get(id);
      pendingDefinitions.delete(id);
      if (!definition) {
        reject(
          new Error(
            `Extension ${id}: "${manifest.renderer}" did not call rosettaStudio.define()`,
          ),
        );
        return;
      }
      try {
        resolve(instantiate(id, definition));
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => {
      reject(
        new Error(`Extension ${id}: could not load "${manifest.renderer}"`),
      );
    };
    document.head.appendChild(script);
  });
};
