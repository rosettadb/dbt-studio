import type React from 'react';
import type { Project } from '../../types/backend';

/** Renderer side of one project type, read through registry.renderer.ts. */
export interface ProjectTypeUi {
  /** Type icon at `size` px, tinted with the theme. */
  Icon: React.ComponentType<{ size?: number }>;
  /** Actions in the project workspace's top bar; none when absent. */
  TopMenuActions?: React.ComponentType<{ project: Project }>;
}
