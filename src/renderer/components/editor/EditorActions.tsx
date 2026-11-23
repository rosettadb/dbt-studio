import React from 'react';
import type { EditorActionContext } from '../../../extensionApi/renderer';
import { editorActions } from '../../../extensionHost/renderer/contributions.renderer';
import { useRegistry } from '../../../extensionHost/renderer/registry.renderer';

// The buttons extensions added to the bar above the code editor, for the
// file that is open. Rendered in order; an action shows only when its
// `when` accepts the file.
export const EditorActions: React.FC<EditorActionContext> = (context) => {
  const actions = useRegistry(editorActions);
  return (
    <>
      {actions
        .filter((action) => action.when(context))
        .map((action) => (
          // eslint-disable-next-line react/jsx-props-no-spreading
          <action.Component key={action.id} {...context} />
        ))}
    </>
  );
};
