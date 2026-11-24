// UI half: how a ClickHouse connection looks in Studio. A plain script in
// AMD shape, written without a build step so the example can be installed
// as it is; a real extension would be bundled from JSX/TypeScript with
// these names marked as externals.

window.rosettaStudio.define(
  'studio-examples.clickhouse',
  ['react', '@mui/material', 'react-router-dom', '@rosetta/studio-api'],
  (React, Mui, Router, studio) => {
    const h = React.createElement;

    // The same facts as in main.js.
    const descriptor = {
      type: 'clickhouse',
      displayName: 'ClickHouse',
      sql: { rules: { quote: 'backtick', folding: 'none', limit: 'limit' } },
    };

    // The tile and list icon. An image URL; here an inline SVG.
    const icon = `data:image/svg+xml;utf8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<g fill="#FFCC01"><rect x="2" y="3" width="2.4" height="18"/>' +
        '<rect x="6.4" y="3" width="2.4" height="18"/>' +
        '<rect x="10.8" y="3" width="2.4" height="18"/>' +
        '<rect x="15.2" y="3" width="2.4" height="18"/>' +
        '<rect x="19.6" y="9.8" width="2.4" height="4.4"/></g></svg>',
    )}`;

    const emptyConnection = (name) => ({
      type: 'clickhouse',
      name: name || '',
      host: 'localhost',
      port: 8123,
      secure: false,
      username: 'default',
      password: '',
      database: 'default',
    });

    // The add / edit form. It gets the same props as Studio's own forms:
    // `connection` when editing, `duplicateFrom` when copying, `onCancel`.
    const ClickHouseForm = ({
      onCancel,
      connection,
      duplicateFrom,
      suggestedName,
    }) => {
      const navigate = Router.useNavigate();
      const saved = (connection || duplicateFrom || {}).connection;
      const [form, setForm] = React.useState(() => ({
        ...emptyConnection(suggestedName),
        ...(saved && saved.type === 'clickhouse' ? saved : {}),
        // A copy starts without a name.
        name: connection ? connection.connection.name : suggestedName || '',
      }));
      const [status, setStatus] = React.useState(null);

      const { data: existing = [] } = studio.useGetConnections();
      const { validateName } = studio.useConnectionNameValidation(
        existing,
        connection && connection.id,
      );
      const nameCheck = validateName(form.name);

      const done = (message) => ({
        onSuccess: () => navigate('/app/connections'),
        onError: (error) =>
          setStatus({
            severity: 'error',
            text: `${message}: ${(error && error.message) || error}`,
          }),
      });
      const { mutate: create, isLoading: isCreating } =
        studio.useConfigureConnection(done('Could not save'));
      const { mutate: update, isLoading: isUpdating } =
        studio.useUpdateConnection(done('Could not update'));
      const { mutate: test, isLoading: isTesting } = studio.useTestConnection({
        onSuccess: (ok) =>
          setStatus(
            ok === true
              ? { severity: 'success', text: 'Connected.' }
              : { severity: 'error', text: 'The server did not answer.' },
          ),
        onError: (error) =>
          setStatus({
            severity: 'error',
            text: `Test failed: ${error.message || error}`,
          }),
      });

      const set = (field) => (event) => {
        const { type, checked, value } = event.target;
        setStatus(null);
        setForm((previous) => ({
          ...previous,
          [field]: type === 'checkbox' ? checked : value,
        }));
      };

      // What is saved. `schema` is what Studio's lists and trees call the
      // default namespace; for ClickHouse that is the database.
      const toSave = () => ({
        ...form,
        port: Number(form.port) || (form.secure ? 8443 : 8123),
        schema: form.database,
      });

      const save = (event) => {
        event.preventDefault();
        if (!nameCheck.isValid) {
          setStatus({ severity: 'error', text: nameCheck.message });
          return;
        }
        if (connection) {
          update({ connection: { id: connection.id, connection: toSave() } });
        } else {
          create({ connection: toSave() });
        }
      };

      const field = (name, label, extra) =>
        h(Mui.TextField, {
          key: name,
          label,
          value: form[name],
          onChange: set(name),
          size: 'small',
          ...extra,
        });

      return h(
        Mui.Box,
        { sx: { width: '100%', p: 3 } },
        h(studio.ConnectionHeader, {
          title: 'ClickHouse Connection',
          imageSource: icon,
          onClose: onCancel,
          onSave: save,
          isLoading: isCreating || isUpdating,
        }),
        h(
          Mui.Box,
          {
            component: 'form',
            onSubmit: save,
            sx: {
              maxWidth: 500,
              mx: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            },
          },
          field('name', 'Connection Name', {
            required: true,
            error: Boolean(form.name) && !nameCheck.isValid,
            helperText:
              form.name && !nameCheck.isValid ? nameCheck.message : '',
          }),
          field('host', 'Host', { required: true }),
          field('port', 'HTTP Port', {
            helperText: '8123, or 8443 with TLS',
          }),
          h(Mui.FormControlLabel, {
            key: 'secure',
            label: 'Use TLS (https)',
            control: h(Mui.Checkbox, {
              checked: Boolean(form.secure),
              onChange: set('secure'),
            }),
          }),
          field('username', 'Username'),
          field('password', 'Password', { type: 'password' }),
          field('database', 'Database'),
          status &&
            h(Mui.Alert, { key: 'status', severity: status.severity }, status.text),
          h(
            Mui.Button,
            {
              key: 'test',
              type: 'button',
              variant: 'contained',
              onClick: () => test(toSave()),
              disabled: isTesting || !form.host,
              sx: { alignSelf: 'flex-start' },
            },
            isTesting ? 'Testing...' : 'Test Connection',
          ),
        ),
      );
    };

    return {
      activate(api) {
        // The tile on the add-connection screen, the form, and how the
        // connection shows in lists. Removed again when the extension is
        // disabled.
        api.connections.register({
          descriptor,
          ui: {
            icon,
            accentColor: '#C7A100',
            Form: ClickHouseForm,
            listDetails: (conn) =>
              `${conn.host}:${conn.port}${conn.database ? `/${conn.database}` : ''}`,
          },
        });
      },
    };
  },
);
