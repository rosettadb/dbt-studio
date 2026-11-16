import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { SpannerConnection } from './spanner.shared';
import { Spanner } from './SpannerForm';

export const spannerUi: ConnectionUi<SpannerConnection> = {
  type: 'spanner',
  icon: connectionIcons.images.spanner,
  accentColor: '#4285F4',
  Form: Spanner,
  sqlEditorInput: (conn) => ({
    type: conn.type,
    name: conn.name,
    project: conn.project,
    instance: conn.instance,
    database: conn.database,
    schema: conn.schema,
    authMethod: conn.authMethod,
    keyfile: conn.keyfile,
    emulatorHost: conn.emulatorHost,
  }),
  listDetails: (conn) =>
    `${conn.project} / ${conn.instance} / ${conn.database}`,
};
