import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as MuiMaterial from '@mui/material';
import * as MuiStyles from '@mui/material/styles';
import * as EmotionReact from '@emotion/react';
import * as EmotionStyled from '@emotion/styled';
import * as ReactRouterDom from 'react-router-dom';
import * as ReactQuery from 'react-query';
import * as monaco from 'monaco-editor';

/** The name an installed extension lists to get Studio's API module. */
export const STUDIO_API_MODULE = '@rosetta/studio-api';

/**
 * Libraries Studio hands to installed extensions instead of letting each
 * bundle its own copy. They must be the same instances Studio uses: two
 * Reacts, two MUI themes or two Monacos in one window do not work together.
 * An extension marks these as externals in its bundler.
 *
 * Each entry is read when an extension asks for it. Studio's API module is
 * added by the app at start-up (`registerSharedModule`) rather than imported
 * here, so the host does not pull in the app's components.
 */
const providers: Record<string, () => unknown> = {
  react: () => React,
  'react-dom': () => ReactDOM,
  'react/jsx-runtime': () => ReactJsxRuntime,
  '@mui/material': () => MuiMaterial,
  '@mui/material/styles': () => MuiStyles,
  '@emotion/react': () => EmotionReact,
  '@emotion/styled': () => EmotionStyled,
  'react-router-dom': () => ReactRouterDom,
  'react-query': () => ReactQuery,
  'monaco-editor': () => monaco,
};

/** Makes a module available to installed extensions under `name`. */
export const registerSharedModule = (
  name: string,
  provider: () => unknown,
): void => {
  providers[name] = provider;
};

export const sharedModuleNames = (): string[] => Object.keys(providers);

export const hasSharedModule = (name: string): boolean =>
  Object.prototype.hasOwnProperty.call(providers, name);

export const getSharedModule = (name: string): unknown => providers[name]();
