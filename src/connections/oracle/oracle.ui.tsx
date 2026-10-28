import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { OracleConnection } from '../../types/backend';
import { Oracle } from './OracleForm';
import { parseOracleEditorStatements } from './oracle.statements.renderer';

export const oracleUi: ConnectionUi<OracleConnection> = {
  type: 'oracle',
  icon: connectionIcons.images.oracle,
  Form: Oracle,
  parseEditorStatements: parseOracleEditorStatements,
  sqlEditorInput: (conn) => ({ ...conn, password: '' }),
  listDetails: (conn) => {
    let description = 'Connect string';
    if (conn.connectMode === 'basic')
      description = `Service: ${conn.serviceName} · ${conn.host}:${conn.port}`;
    if (conn.connectMode === 'wallet')
      description = `Wallet alias: ${conn.connectString}`;
    return description;
  },
};
