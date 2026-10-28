import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { DuckLakeConnectionConfig } from './ducklake.shared';

export const ducklakeUi: ConnectionUi<DuckLakeConnectionConfig> = {
  type: 'ducklake',
  icon: connectionIcons.images.ducklake,
};
