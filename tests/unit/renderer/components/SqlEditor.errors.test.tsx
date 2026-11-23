import React from 'react';
import { act, render } from '@testing-library/react';
import { toast } from 'react-toastify';
import {
  SqlEditor,
  SqlEditorHandle,
} from '../../../../src/extensions/sql/renderer/sqlEditor';
import { connectorsServices } from '../../../../src/renderer/services';
import { SNOWFLAKE_REAUTH_MESSAGE } from '../../../../src/types/backend';

jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('../../../../src/renderer/services', () => ({
  connectorsServices: { executeQueryForConnection: jest.fn() },
  projectsServices: {},
}));
jest.mock('../../../../src/renderer/services/duckLake.service', () => ({
  DuckLakeService: {},
}));
jest.mock('../../../../src/renderer/hooks', () => ({
  useAppContext: () => ({ fetchSchema: jest.fn() }),
}));
// Studio's controllers barrel is loaded by the editor's imports; none of
// its hooks is used in these tests.
jest.mock('../../../../src/renderer/controllers', () => ({}));
jest.mock('../../../../src/extensions/sql/renderer/editor.controller', () => ({
  useSqlEditorBridge: jest.fn(),
}));
jest.mock(
  '../../../../src/extensions/sql/renderer/sqlEditor/editorComponent',
  () => ({ SqlEditorComponent: () => null }),
);
jest.mock('../../../../src/renderer/lib/monaco/insertText', () => ({
  insertTextAtCursor: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

async function runQuery(error: string) {
  const editorRef = React.createRef<SqlEditorHandle>();
  const setError = jest.fn();
  const setLoadingQuery = jest.fn();
  (connectorsServices.executeQueryForConnection as jest.Mock).mockResolvedValue(
    {
      success: false,
      error,
    },
  );
  render(
    <SqlEditor
      ref={editorRef}
      completions={[]}
      connectionId="pg-test"
      queryHistory={[]}
      setQueryHistory={jest.fn()}
      setQueryResults={jest.fn()}
      setLoadingQuery={setLoadingQuery}
      setError={setError}
    />,
  );
  await act(async () => {
    editorRef.current?.runQuery('SELECT * FROM CUSTOMERS');
  });
  return { setError, setLoadingQuery };
}

it('preserves the database error without replacing it with a frontend exception', async () => {
  const error = 'relation "customers" does not exist';
  const { setError, setLoadingQuery } = await runQuery(error);
  expect(setError.mock.calls).toEqual([[undefined], [error]]);
  expect(setLoadingQuery).toHaveBeenLastCalledWith(false);
  expect(toast.error).not.toHaveBeenCalled();
});

it('keeps Snowflake reauthentication guidance visible', async () => {
  const { setError } = await runQuery(SNOWFLAKE_REAUTH_MESSAGE);
  expect(setError).toHaveBeenLastCalledWith(SNOWFLAKE_REAUTH_MESSAGE);
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(toast.error).toHaveBeenCalledWith(SNOWFLAKE_REAUTH_MESSAGE);
});
