import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import {
  PanelHeaderDropdown,
  PanelHeaderDropdownItem,
  buildConnectionDropdownItems,
} from '../../../../src/renderer/components/panelHeaderDropdown';
import type { ConnectionModel, Project } from '../../../../src/types/backend';
import type { DuckLakeInstance } from '../../../../src/types/duckLake';

const items: PanelHeaderDropdownItem[] = [
  { value: 'c1', label: 'Warehouse' },
  { value: 'c2', label: 'Analytics' },
];

const renderDropdown = (
  props: Partial<React.ComponentProps<typeof PanelHeaderDropdown>> = {},
) => {
  const handlers = {
    onSelect: jest.fn(),
    onAll: jest.fn(),
    onAdd: jest.fn(),
  };
  render(
    <ThemeProvider theme={createTheme()}>
      <PanelHeaderDropdown
        data-testid="picker"
        items={items}
        value="c2"
        placeholder="Select Connection"
        allLabel="All Connections"
        addLabel="Add connection"
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...handlers}
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...props}
      />
    </ThemeProvider>,
  );
  return handlers;
};

const openMenu = () => {
  fireEvent.click(screen.getByTestId('picker'));
  return screen.getByRole('menu');
};

// All and Add are menu items; the items themselves are radio items
const menuRowNames = (menu: HTMLElement) =>
  Array.from(
    menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'),
  ).map((row) => row.textContent);

describe('PanelHeaderDropdown', () => {
  it('shows the selected item on the button', () => {
    renderDropdown();
    expect(screen.getByTestId('picker')).toHaveTextContent('Analytics');
  });

  it('shows the placeholder when nothing is selected', () => {
    renderDropdown({ value: undefined });
    expect(screen.getByTestId('picker')).toHaveTextContent('Select Connection');
  });

  it('lists All first, then the items, then Add', () => {
    renderDropdown();
    expect(menuRowNames(openMenu())).toEqual([
      'All Connections',
      'Warehouse',
      'Analytics',
      'Add connection',
    ]);
  });

  it('has no group headings', () => {
    renderDropdown();
    const menu = openMenu();
    expect(within(menu).queryByText('Database Connections')).toBeNull();
    expect(menu.querySelector('.MuiListSubheader-root')).toBeNull();
  });

  it('shows only Add when there are no items', () => {
    renderDropdown({ items: [], value: undefined });
    const menu = openMenu();
    expect(menuRowNames(menu)).toEqual(['Add connection']);
    expect(menu.querySelector('hr')).toBeNull();
  });

  it('marks only the selected item with a tick', () => {
    renderDropdown();
    const menu = openMenu();
    const [warehouse, analytics] = within(menu).getAllByRole('menuitemradio');
    const tickOf = (row: HTMLElement) =>
      row.querySelector('[data-testid="CheckIcon"]') as SVGElement;
    expect(tickOf(analytics)).toHaveStyle({ visibility: 'visible' });
    expect(tickOf(warehouse)).toHaveStyle({ visibility: 'hidden' });
  });

  it('tells screen readers which item is selected', () => {
    renderDropdown();
    const menu = openMenu();
    expect(
      within(menu).getByRole('menuitemradio', { name: 'Analytics' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      within(menu).getByRole('menuitemradio', { name: 'Warehouse' }),
    ).toHaveAttribute('aria-checked', 'false');
    // All and Add are actions, not choices
    expect(
      within(menu).getByRole('menuitem', { name: 'All Connections' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Add connection' }),
    ).toBeInTheDocument();
  });

  it('keeps an item whose value looks like an action key apart from Add', () => {
    renderDropdown({
      items: [{ value: 'add-item', label: 'Odd name' }],
      value: undefined,
    });
    expect(menuRowNames(openMenu())).toEqual([
      'All Connections',
      'Odd name',
      'Add connection',
    ]);
  });

  it('selects the clicked item and closes the menu', () => {
    const { onSelect, onAll, onAdd } = renderDropdown();
    fireEvent.click(within(openMenu()).getByText('Warehouse'));
    expect(onSelect).toHaveBeenCalledWith('c1');
    expect(onAll).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId('picker')).not.toHaveAttribute('aria-expanded');
  });

  it('opens the full list from the All row', () => {
    const { onSelect, onAll } = renderDropdown();
    fireEvent.click(within(openMenu()).getByText('All Connections'));
    expect(onAll).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('adds from the Add row, also when the list is empty', () => {
    const { onAdd, onSelect } = renderDropdown({ items: [] });
    fireEvent.click(within(openMenu()).getByText('Add connection'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('buildConnectionDropdownItems', () => {
  const connections = [
    { id: 'c1', connection: { name: 'Warehouse', type: 'postgres' } },
    { id: 'c2', connection: { name: 'Local', type: 'duckdb' } },
  ] as unknown as ConnectionModel[];
  const duckLakeInstances = [
    { id: 'd1', name: 'Lake' },
  ] as unknown as DuckLakeInstance[];
  const projects = [
    { id: 'p1', name: 'Shop', connectionId: 'c1' },
  ] as unknown as Project[];

  it('lists connections, then DuckLake instances with a ducklake- value', () => {
    const result = buildConnectionDropdownItems(
      connections,
      duckLakeInstances,
      projects,
      'p1',
    );
    expect(result.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: 'c1', label: 'Warehouse' },
      { value: 'c2', label: 'Local' },
      { value: 'ducklake-d1', label: 'Lake' },
    ]);
  });

  it('adds the link icon only to connections used by a project', () => {
    const result = buildConnectionDropdownItems(
      connections,
      duckLakeInstances,
      projects,
      'p1',
    );
    expect(result[0].trailing).toBeTruthy();
    expect(result[1].trailing).toBeFalsy();
    expect(result[2].trailing).toBeUndefined();
  });

  it('names the selected project when several projects share a connection', () => {
    const sharingProjects = [
      { id: 'p1', name: 'Shop', connectionId: 'c1' },
      { id: 'p2', name: 'Finance', connectionId: 'c1' },
    ] as unknown as Project[];
    const linkTitle = (selectedProjectId: string | undefined) =>
      (
        buildConnectionDropdownItems(
          connections,
          [],
          sharingProjects,
          selectedProjectId,
        )[0].trailing as React.ReactElement<{ title: string }>
      ).props.title;

    expect(linkTitle('p2')).toBe('Project: Finance');
    // With no matching selection it falls back to the first project
    expect(linkTitle(undefined)).toBe('Project: Shop');
  });

  it('returns nothing when there are no connections or instances', () => {
    expect(buildConnectionDropdownItems([], [], projects, 'p1')).toEqual([]);
  });
});
