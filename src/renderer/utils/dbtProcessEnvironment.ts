import { ConnectionInput } from '../../types/backend';
import { getDescriptor } from '../../connections/registry.shared';

const adapterLabel = (connectionType: ConnectionInput['type']): string =>
  getDescriptor(connectionType)?.dbtAdapterLabel ??
  connectionType.charAt(0).toUpperCase() + connectionType.slice(1);

export const getDbtV2CompatibilityError = (
  dbtVersion: string | undefined,
  connectionType: ConnectionInput['type'],
): string | null => {
  if (
    dbtVersion?.startsWith('2.') &&
    !getDescriptor(connectionType)?.capabilities.dbtV2
  ) {
    return `${adapterLabel(connectionType)} is not supported safely by dbt Core v2 preview. Switch the global dbt runtime to a stable v1 release in Settings before running this project.`;
  }
  return null;
};
