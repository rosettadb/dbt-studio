import { STUDIO_WORKSPACES } from '../../../extensionApi/renderer';
import { workspaceTabRegistry } from '../../../extensionHost/renderer/contributions.renderer';
import { analyticsWorkspaceTab } from './workspaceTab';

// Analytics adds itself to the SQL Editor screen as a tab. Registered from
// the app entry until Analytics becomes an extension
// (docs/extensions/PLAN.md, phase 5).
workspaceTabRegistry(STUDIO_WORKSPACES.sql).add(analyticsWorkspaceTab);
