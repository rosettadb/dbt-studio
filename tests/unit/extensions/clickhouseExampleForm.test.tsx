import fs from 'fs';
import path from 'path';
import React from 'react';
import * as Mui from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';

// The UI half of docs/extensions/examples/clickhouse, run the way Studio's
// loader runs an installed extension: the script calls
// window.rosettaStudio.define(id, dependencies, factory) and gets Studio's
// libraries. Studio's hooks are replaced here; what is under test is what
// the example registers and what its form sends.

const SCRIPT = fs.readFileSync(
  path.join(
    __dirname,
    '../../../docs/extensions/examples/clickhouse/renderer.js',
  ),
  'utf8',
);

const mockNavigate = jest.fn();
const create = jest.fn();
const update = jest.fn();
const test = jest.fn();
let testOptions: any;

const studio = {
  useGetConnections: () => ({
    data: [{ id: 'c0', connection: { name: 'taken' } }],
  }),
  useConnectionNameValidation: () => ({
    validateName: (name: string) =>
      name === 'taken'
        ? {
            isValid: false,
            message: 'A connection with this name already exists',
          }
        : {
            isValid: Boolean(name),
            message: 'Connection name cannot be empty',
          },
  }),
  useConfigureConnection: () => ({ mutate: create, isLoading: false }),
  useUpdateConnection: () => ({ mutate: update, isLoading: false }),
  useTestConnection: (options: any) => {
    testOptions = options;
    return { mutate: test, isLoading: false };
  },
  ConnectionHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
};

const loadExample = () => {
  let defined: { id: string; dependencies: string[]; module: any } | undefined;
  (window as any).rosettaStudio = {
    define: (id: string, dependencies: string[], factory: any) => {
      const provided: Record<string, unknown> = {
        react: React,
        '@mui/material': Mui,
        'react-router-dom': { useNavigate: () => mockNavigate },
        '@rosetta/studio-api': studio,
      };
      defined = {
        id,
        dependencies,
        module: factory(...dependencies.map((name) => provided[name])),
      };
    },
  };
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)();
  if (!defined) throw new Error('The script did not call define');

  const register = jest.fn();
  defined.module.activate({ connections: { register } });
  return { ...defined, registered: register.mock.calls[0][0] };
};

beforeEach(() => jest.clearAllMocks());

describe('the ClickHouse example extension, UI half', () => {
  it('registers ClickHouse with a form, an icon and its list text', () => {
    const { id, registered } = loadExample();

    expect(id).toBe('studio-examples.clickhouse');
    expect(registered.descriptor).toMatchObject({
      type: 'clickhouse',
      displayName: 'ClickHouse',
    });
    expect(registered.ui.icon).toMatch(/^data:image\/svg\+xml/);
    expect(typeof registered.ui.Form).toBe('function');
    expect(
      registered.ui.listDetails({ host: 'h', port: 8123, database: 'shop' }),
    ).toBe('h:8123/shop');
  });

  it('tests and saves a new connection with what was typed', () => {
    const { registered } = loadExample();
    const Form = registered.ui.Form;
    render(<Form onCancel={jest.fn()} />);

    const type = (label: RegExp, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    type(/Connection Name/, 'play');
    type(/^Host/, 'play.clickhouse.com');
    type(/HTTP Port/, '443');
    fireEvent.click(screen.getByLabelText(/Use TLS/));
    type(/Username/, 'play');

    const expected = {
      type: 'clickhouse',
      name: 'play',
      host: 'play.clickhouse.com',
      port: 443,
      secure: true,
      username: 'play',
      password: '',
      database: 'default',
      schema: 'default',
    };

    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
    expect(test).toHaveBeenCalledWith(expected);
    React.act(() => testOptions.onSuccess(true));
    expect(screen.getByText('Connected.')).toBeTruthy();

    fireEvent.submit(document.querySelector('form')!);
    expect(create).toHaveBeenCalledWith({ connection: expected });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a name that is taken, and updates when editing', () => {
    const { registered } = loadExample();
    const Form = registered.ui.Form;

    const { unmount } = render(<Form onCancel={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Connection Name/), {
      target: { value: 'taken' },
    });
    fireEvent.submit(document.querySelector('form')!);
    expect(create).not.toHaveBeenCalled();
    expect(
      screen.getAllByText('A connection with this name already exists').length,
    ).toBeGreaterThan(0);
    unmount();

    const saved = {
      id: 'c1',
      connection: {
        type: 'clickhouse',
        name: 'warehouse',
        host: 'ch.internal',
        port: 8123,
        secure: false,
        username: 'default',
        password: 'pw',
        database: 'shop',
        schema: 'shop',
      },
    };
    render(<Form onCancel={jest.fn()} connection={saved} />);
    fireEvent.change(screen.getByLabelText(/Database/), {
      target: { value: 'sales' },
    });
    fireEvent.submit(document.querySelector('form')!);
    expect(update).toHaveBeenCalledWith({
      connection: {
        id: 'c1',
        connection: { ...saved.connection, database: 'sales', schema: 'sales' },
      },
    });
  });
});
