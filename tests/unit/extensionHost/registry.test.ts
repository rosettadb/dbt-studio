import {
  byOrder,
  createRegistry,
} from '../../../src/extensionHost/renderer/registry.renderer';
import { isNavigationItemActive } from '../../../src/extensionHost/renderer/contributions.renderer';
import {
  getBottomElements,
  getMainElements,
} from '../../../src/renderer/components/sidebar/elements';

type Item = { id: string; order?: number; label?: string };

describe('registry', () => {
  it('lists items in the order they were added', () => {
    const registry = createRegistry<Item>();
    registry.add({ id: 'a' });
    registry.add({ id: 'b' });

    expect(registry.list().map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('sorts by the given order and keeps ties in insertion order', () => {
    const registry = createRegistry<Item>({ compare: byOrder });
    registry.add({ id: 'late', order: 300 });
    registry.add({ id: 'unordered' });
    registry.add({ id: 'first', order: 100 });
    registry.add({ id: 'also-first', order: 100 });

    expect(registry.list().map((item) => item.id)).toEqual([
      'first',
      'also-first',
      'late',
      'unordered',
    ]);
  });

  it('replaces an item with the same id in place', () => {
    const registry = createRegistry<Item>();
    registry.add({ id: 'a', label: 'old' });
    registry.add({ id: 'b' });
    registry.add({ id: 'a', label: 'new' });

    expect(registry.list()).toEqual([{ id: 'a', label: 'new' }, { id: 'b' }]);
  });

  it('removes an item when its disposer is called, once', () => {
    const registry = createRegistry<Item>();
    const disposable = registry.add({ id: 'a' });
    registry.add({ id: 'b' });

    disposable.dispose();
    disposable.dispose();

    expect(registry.list().map((item) => item.id)).toEqual(['b']);
    expect(registry.get('a')).toBeUndefined();
  });

  it('does not remove an item that replaced the disposed one', () => {
    const registry = createRegistry<Item>();
    const first = registry.add({ id: 'a', label: 'old' });
    registry.add({ id: 'a', label: 'new' });

    first.dispose();

    expect(registry.list()).toEqual([{ id: 'a', label: 'new' }]);
  });

  it('tells subscribers about every change with a new list', () => {
    const registry = createRegistry<Item>();
    const listener = jest.fn();
    const before = registry.list();
    const unsubscribe = registry.subscribe(listener);

    const disposable = registry.add({ id: 'a' });
    expect(registry.list()).not.toBe(before);
    disposable.dispose();
    unsubscribe();
    registry.add({ id: 'b' });

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('sidebar active item', () => {
  const items = [...getMainElements(true), ...getBottomElements()];
  const activeFor = (pathname: string) =>
    items
      .filter((item) => isNavigationItemActive(item, pathname))
      .map((item) => item.id);

  it.each([
    ['/app', ['home']],
    ['/app/dbt-project', ['project']],
    ['/app/sql', ['sql']],
    ['/app/notebooks', ['notebooks']],
    ['/app/cloud-explorer/dashboard', ['cloud-explorer']],
    ['/app/cloud-explorer/edit-connection/7', ['cloud-explorer']],
    ['/app/data-lake/ducklake/instances/1/tables/t', ['data-lake']],
    ['/app/flows', ['flows']],
    ['/app/connections', ['connections']],
    ['/app/edit-connection/3', ['connections']],
    ['/app/add-connection', ['connections']],
    ['/app/add-connection/project-1', ['connections']],
    ['/app/settings/general', ['settings']],
    ['/app/select-project', []],
  ])('%s marks %j', (pathname, expected) => {
    expect(activeFor(pathname)).toEqual(expected);
  });

  it('keeps the order and test ids the sidebar had', () => {
    expect(getMainElements(true).map((item) => item.testId)).toEqual([
      'nav-item-home',
      'nav-item-files',
      'nav-item-sql',
      'nav-item-notebooks',
      'nav-item-cloud-explorer',
      'nav-item-data-lake',
      'nav-item-flows',
    ]);
    expect(getBottomElements().map((item) => item.testId)).toEqual([
      'nav-item-connections',
      'nav-item-settings',
    ]);
  });

  it('greys out Project while no project is selected', () => {
    const project = (hasProject: boolean) =>
      getMainElements(hasProject).find((item) => item.id === 'project');

    expect(project(false)?.disabled).toBe(true);
    expect(project(true)?.disabled).toBe(false);
  });
});
