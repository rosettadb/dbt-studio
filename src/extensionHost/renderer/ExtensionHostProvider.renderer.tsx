import React from 'react';
import { Splash } from '../../renderer/components/splash';
import { appProviders } from './contributions.renderer';
import { extensionHostRenderer, type ExtensionStatus } from './index.renderer';
import { useRegistry } from './registry.renderer';

type Props = {
  children: React.ReactNode;
};

/**
 * Starts the window's extension host and holds the app back until the first
 * activation pass is done, so the screens and sidebar items of extensions
 * exist before the router decides where a route goes. It also mounts the
 * providers extensions contributed around the app.
 */
export const ExtensionHostProvider: React.FC<Props> = ({ children }) => {
  const [isReady, setIsReady] = React.useState(false);
  const providers = useRegistry(appProviders);

  React.useEffect(() => {
    let isMounted = true;
    const showApp = () => {
      if (isMounted) setIsReady(true);
    };
    // The app opens whether or not the extensions could be started.
    extensionHostRenderer.start().then(showApp).catch(showApp);
    return () => {
      isMounted = false;
    };
  }, []);

  if (!isReady) {
    return <Splash loaderMessage="Loading extensions..." />;
  }

  // The first provider in the list ends up outermost.
  return providers.reduceRight<React.ReactElement>(
    (inner, provider) => (
      <provider.Component key={provider.id}>{inner}</provider.Component>
    ),
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>,
  );
};

/** Every extension with the state of both halves, for the Extensions screen. */
export const useExtensions = (): ReadonlyArray<ExtensionStatus> =>
  React.useSyncExternalStore(
    extensionHostRenderer.subscribe,
    extensionHostRenderer.getSnapshot,
    extensionHostRenderer.getSnapshot,
  );
