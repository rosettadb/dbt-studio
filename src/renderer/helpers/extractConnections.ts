import yaml from 'js-yaml';
import { RosettaConnection } from '../../types/backend';

const extractConnections = (yamlString: string): RosettaConnection[] => {
  try {
    const doc = yaml.load(yamlString) as any;
    return doc.connections || [];
  } catch (error) {
    return [];
  }
};

export default extractConnections;
