import yaml from 'js-yaml';
import { RosettaConnection } from '../../types/backend';

const saveConnection = (
  yamlString: string,
  connection: RosettaConnection,
): string | undefined => {
  try {
    const doc = yaml.load(yamlString) as { connections: RosettaConnection[] };
    doc.connections.push(connection);
    return yaml.dump(doc);
  } catch (error) {
    return undefined;
  }
};

export default saveConnection;
