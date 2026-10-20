import React from 'react';
import {
  registerFallbackFileView,
  registerFileView,
  resolveFileView,
} from '../../../../src/renderer/components/fileViews/registry';
import type { EditorTabState } from '../../../../src/types/editor';

const tab = (path: string): EditorTabState => ({
  id: path,
  path,
  title: path,
  content: '',
  isModified: false,
  isLoading: false,
});

const Noop: React.FC = () => null;

describe('file view registry', () => {
  beforeEach(() => {
    registerFallbackFileView({
      id: 'code',
      matches: () => true,
      Component: Noop,
    });
  });

  it('falls back to the code view when nothing matches', () => {
    expect(resolveFileView(tab('/p/models/a.sql')).id).toBe('code');
  });

  it('picks the first registered view whose matcher accepts the tab', () => {
    registerFileView({
      id: 'yaml',
      matches: (t) => t.path.endsWith('.yml'),
      Component: Noop,
    });
    registerFileView({
      id: 'pipeline-like',
      matches: (t) => t.path.includes('/pipelines/'),
      Component: Noop,
    });

    expect(resolveFileView(tab('/p/rosetta/pipelines/ci.yml')).id).toBe('yaml');
    expect(resolveFileView(tab('/p/rosetta/pipelines/ci.yaml')).id).toBe(
      'pipeline-like',
    );
    expect(resolveFileView(tab('/p/README.md')).id).toBe('code');
  });

  it('re-registering an id replaces the view in place', () => {
    registerFileView({ id: 'yaml', matches: () => false, Component: Noop });
    expect(resolveFileView(tab('/p/a.yml')).id).not.toBe('yaml');
  });
});
