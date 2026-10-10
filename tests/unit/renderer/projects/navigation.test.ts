import {
  getDbtStudioTarget,
  getMainElements,
} from '../../../../src/renderer/components/sidebar/elements';
import { projectsSidebarElements } from '../../../../src/renderer/components/projects/ProjectsSidebar';

describe('projects navigation', () => {
  it('nav rail DBT Studio target depends on selection and is never disabled', () => {
    expect(getDbtStudioTarget(true)).toBe('/app/dbt-project');
    expect(getDbtStudioTarget(false)).toBe('/app/projects/dashboard');
    const el = getMainElements(false).find(
      (e) => e.path === '/app/dbt-project',
    );
    expect(el?.disabled).toBeFalsy();
  });

  it('projects sidebar lists dashboard, list and recent', () => {
    expect(projectsSidebarElements.map((e) => e.path)).toEqual([
      '/app/projects/dashboard',
      '/app/projects/list',
      '/app/projects/recent',
    ]);
  });
});
