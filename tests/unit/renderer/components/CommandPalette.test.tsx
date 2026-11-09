import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { CommandPalette } from '../../../../src/renderer/components/commandPalette';
import { HighlightedLine } from '../../../../src/renderer/components/searchInFiles';
import {
  getBottomElements,
  getMainElements,
} from '../../../../src/renderer/components/sidebar/elements';

const mockNavigate = jest.fn();
const mockOpenFile = jest.fn();
const mockOpenFileAt = jest.fn();
const mockSelectProject = jest.fn();
const mockSearchInFiles = jest.fn();
const mockUseGetSelectedProject = jest.fn();
const mockUseGetProjectFiles = jest.fn();
const mockToastError = jest.fn();
const mockRevealFolderInTree = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('react-toastify', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetProjects: () => ({
    data: [
      { id: 'p1', name: 'Shop', path: '/projects/shop' },
      { id: 'p2', name: 'Finance', path: '/projects/finance' },
    ],
  }),
  useGetSelectedProject: () => mockUseGetSelectedProject(),
  useGetProjectFiles: (...args: unknown[]) => mockUseGetProjectFiles(...args),
  useSelectProject: () => ({ mutateAsync: mockSelectProject }),
}));

jest.mock('../../../../src/renderer/context/TabsProvider', () => ({
  useTabs: () => ({
    openFile: mockOpenFile,
    openFileAt: mockOpenFileAt,
    revealFolderInTree: mockRevealFolderInTree,
  }),
}));

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {
    searchInFiles: (...args: unknown[]) => mockSearchInFiles(...args),
  },
}));

const PROJECT_PATH = '/projects/shop';

const fileNode = (relativePath: string) => ({
  name: relativePath.split('/').pop(),
  path: `${PROJECT_PATH}/${relativePath}`,
  type: 'file',
});

const projectTreeWith = (...relativePaths: string[]) => ({
  name: 'shop',
  path: PROJECT_PATH,
  type: 'directory',
  children: relativePaths.map(fileNode),
});

const folderNode = (relativePath: string, children: unknown[] = []) => ({
  name: relativePath.split('/').pop(),
  path: `${PROJECT_PATH}/${relativePath}`,
  type: 'folder',
  children,
});

const projectTreeOf = (...children: unknown[]) => ({
  name: 'shop',
  path: PROJECT_PATH,
  type: 'folder',
  children,
});

const textMatch = (line: number, lineText: string, column = 1, length = 6) => ({
  line,
  column,
  length,
  lineText,
});

const openPalette = () => {
  render(<CommandPalette />);
  fireEvent.click(screen.getByRole('button', { name: 'Search (Ctrl+K)' }));
};

const typeQuery = (query: string) => {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: query } });
};

const pressKey = (key: string) => {
  fireEvent.keyDown(screen.getByRole('combobox'), { key });
};

const sectionHeader = (title: string) =>
  screen.getByText(title).parentElement as HTMLElement;

const dialogIsClosed = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

const reopenPalette = async () => {
  await dialogIsClosed();
  fireEvent.click(screen.getByRole('button', { name: 'Search (Ctrl+K)' }));
};

const optionLabels = () =>
  screen
    .getAllByRole('option')
    .map((option) => option.getAttribute('aria-label') ?? option.textContent);

const highlightedOption = () => screen.getByRole('option', { selected: true });

const searchFinishesWith = (...fileNames: string[]) => {
  mockSearchInFiles.mockResolvedValue({
    results: fileNames.map((fileName) => ({
      path: `${PROJECT_PATH}/${fileName}`,
      matches: [
        textMatch(1, `zzword one in ${fileName}`),
        textMatch(2, `zzword two in ${fileName}`),
      ],
    })),
    truncated: false,
  });
};

describe('CommandPalette', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Element.prototype.scrollIntoView = jest.fn();
    mockUseGetSelectedProject.mockReturnValue({
      data: { id: 'p1', name: 'Shop', path: PROJECT_PATH },
    });
    mockUseGetProjectFiles.mockReturnValue({ data: projectTreeWith() });
    mockSearchInFiles.mockResolvedValue({ results: [], truncated: false });
    mockSelectProject.mockResolvedValue(undefined);
  });

  describe('opening', () => {
    it('stays closed until asked', () => {
      render(<CommandPalette />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens from the top bar icon', () => {
      openPalette();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('opens with Ctrl+K', () => {
      render(<CommandPalette />);

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('leaves Ctrl+K alone when an editor already handled the key', () => {
      render(<CommandPalette />);

      const handledByEditor = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        cancelable: true,
      });
      handledByEditor.preventDefault();
      act(() => {
        window.dispatchEvent(handledByEditor);
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('keeps the search when closed with Escape', async () => {
      openPalette();
      typeQuery('sql');

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      await reopenPalette();

      expect(screen.getByRole('combobox')).toHaveValue('sql');
    });
  });

  describe('sections', () => {
    it('shows screens and projects with their counts before anything is typed', () => {
      openPalette();

      const screenCount =
        getMainElements(true).length + getBottomElements().length;
      expect(
        within(sectionHeader('Go to')).getByText(String(screenCount)),
      ).toBeInTheDocument();
      expect(
        within(sectionHeader('Projects')).getByText('2'),
      ).toBeInTheDocument();
    });

    it('pins section titles while the results scroll', () => {
      openPalette();

      expect(sectionHeader('Go to')).toHaveStyle({
        position: 'sticky',
        top: '0px',
      });
    });

    it('stacks the titles of later sections at the bottom, nearest first', () => {
      openPalette();

      // Go to is followed by Projects, so it sits one title above the bottom
      expect(sectionHeader('Go to')).toHaveStyle({ bottom: '32px' });
      expect(sectionHeader('Projects')).toHaveStyle({ bottom: '0px' });
    });

    it('lets a later title cover an earlier one at the top', () => {
      openPalette();

      expect(Number(getComputedStyle(sectionHeader('Projects')).zIndex)).toBe(
        Number(getComputedStyle(sectionHeader('Go to')).zIndex) + 1,
      );
    });

    it('lets the titles pin across the whole list, not just their section', () => {
      openPalette();

      expect(screen.getByRole('group', { name: 'Go to' })).toHaveStyle({
        display: 'contents',
      });
    });

    it('hides sections with no results', () => {
      openPalette();
      typeQuery('finance');

      expect(screen.queryByText('Go to')).not.toBeInTheDocument();
      expect(screen.getByText('Projects')).toBeInTheDocument();
    });

    it('says so when nothing matches', async () => {
      openPalette();
      typeQuery('nothing-matches-this');

      expect(await screen.findByText('No results found.')).toBeInTheDocument();
    });
  });

  describe('result details', () => {
    it('describes what each screen is for', () => {
      [...getMainElements(true), ...getBottomElements()].forEach((element) => {
        expect(element.description).toBeTruthy();
      });

      openPalette();
      typeQuery('sql editor');

      expect(
        screen.getByText('Write and run SQL against your connections'),
      ).toBeInTheDocument();
    });

    it('shows the folder of each project', () => {
      openPalette();

      expect(screen.getByText('/projects/finance')).toBeInTheDocument();
    });

    it('shows the folder of a file inside the project', () => {
      mockUseGetProjectFiles.mockReturnValue({
        data: projectTreeWith('models/staging/orders.sql', 'orders.yml'),
      });
      openPalette();
      typeQuery('orders');

      expect(screen.getByText('models/staging')).toBeInTheDocument();
      expect(screen.getByText('Project root')).toBeInTheDocument();
    });

    it('shows the file and line of a text match, with the word highlighted', async () => {
      mockSearchInFiles.mockResolvedValue({
        results: [
          {
            path: `${PROJECT_PATH}/models/orders.sql`,
            matches: [textMatch(9, 'select * from orders')],
          },
        ],
        truncated: false,
      });
      openPalette();
      typeQuery('select');

      expect(await screen.findByText('models/orders.sql')).toBeInTheDocument();
      expect(screen.getByText('Line 9')).toBeInTheDocument();
      expect(document.querySelector('mark')).toHaveTextContent('select');
    });

    it('keeps the highlighted word dark so it can be read in dark mode', () => {
      render(
        <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
          <HighlightedLine text="select 1" column={1} length={6} />
        </ThemeProvider>,
      );

      expect(document.querySelector('mark')).toHaveStyle({ color: '#212121' });
    });
  });

  describe('limits', () => {
    it('says how many files are hidden when there are too many to list', () => {
      const manyFiles = Array.from(
        { length: 25 },
        (_, index) => `models/order_${index}.sql`,
      );
      mockUseGetProjectFiles.mockReturnValue({
        data: projectTreeWith(...manyFiles),
      });
      openPalette();
      typeQuery('order_');

      expect(
        within(sectionHeader('Files')).getByText('20 of 25'),
      ).toBeInTheDocument();
      expect(screen.getByText('order_19.sql')).toBeInTheDocument();
      expect(screen.queryByText('order_20.sql')).not.toBeInTheDocument();
    });

    it('lists every text match, across files', async () => {
      const matches = Array.from({ length: 50 }, (_, index) =>
        textMatch(index + 1, `select ${index}`),
      );
      mockSearchInFiles.mockResolvedValue({
        results: [
          { path: `${PROJECT_PATH}/a.sql`, matches },
          { path: `${PROJECT_PATH}/b.sql`, matches: matches.slice(0, 10) },
        ],
        truncated: false,
      });
      openPalette();
      typeQuery('select');

      await screen.findByText('Text in files');
      expect(
        within(sectionHeader('Text in files')).getByText('60'),
      ).toBeInTheDocument();
      expect(screen.getByText('b.sql')).toBeInTheDocument();
      expect(screen.getAllByText('Line 10')).toHaveLength(2);
    });

    it('marks the text count when the search itself stopped early', async () => {
      mockSearchInFiles.mockResolvedValue({
        results: [
          {
            path: `${PROJECT_PATH}/a.sql`,
            matches: [textMatch(1, 'select 1')],
          },
        ],
        truncated: true,
      });
      openPalette();
      typeQuery('select');

      await screen.findByText('Text in files');
      expect(
        within(sectionHeader('Text in files')).getByText('1+'),
      ).toBeInTheDocument();
    });
  });

  describe('searching text', () => {
    it('searches the selected project after a pause in typing', async () => {
      openPalette();
      typeQuery('  select  ');

      await waitFor(() =>
        expect(mockSearchInFiles).toHaveBeenCalledWith({
          path: PROJECT_PATH,
          query: 'select',
        }),
      );
    });

    it('waits for two characters', async () => {
      openPalette();
      typeQuery('s');

      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 350);
        });
      });

      expect(mockSearchInFiles).not.toHaveBeenCalled();
    });

    it('shows no text results when the search fails', async () => {
      mockSearchInFiles.mockRejectedValue(new Error('search failed'));
      openPalette();
      typeQuery('select');

      await waitFor(() => expect(mockSearchInFiles).toHaveBeenCalled());
      expect(await screen.findByText('No results found.')).toBeInTheDocument();
    });

    it('ignores an older search that finishes after a newer one started', async () => {
      let finishOlderSearch: (value: unknown) => void = () => {};
      mockSearchInFiles.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOlderSearch = resolve;
          }),
      );
      mockSearchInFiles.mockResolvedValueOnce({
        results: [
          { path: `${PROJECT_PATH}/new.sql`, matches: [textMatch(1, 'newer')] },
        ],
        truncated: false,
      });
      openPalette();
      typeQuery('older');
      await waitFor(() => expect(mockSearchInFiles).toHaveBeenCalledTimes(1));

      typeQuery('newer');
      await screen.findByText('new.sql');
      await act(async () => {
        finishOlderSearch({
          results: [
            {
              path: `${PROJECT_PATH}/old.sql`,
              matches: [textMatch(1, 'older')],
            },
          ],
          truncated: false,
        });
      });

      expect(screen.queryByText('old.sql')).not.toBeInTheDocument();
      expect(screen.getByText('new.sql')).toBeInTheDocument();
    });

    it('drops the previous matches as soon as the search changes', async () => {
      mockSearchInFiles.mockResolvedValueOnce({
        results: [
          {
            path: `${PROJECT_PATH}/old.sql`,
            matches: [textMatch(1, 'select')],
          },
        ],
        truncated: false,
      });
      openPalette();
      typeQuery('select');
      await screen.findByText('old.sql');

      typeQuery('selects');

      // Gone before the next search has even started
      expect(screen.queryByText('old.sql')).not.toBeInTheDocument();
    });
  });

  describe('scrolling with the arrow keys', () => {
    // jsdom has no layout, so give the list and rows sizes by hand. The list
    // is 200px tall, and "Go to" rows have the Projects title (32px) pinned
    // under them, so they are visible from 32px to 168px.
    const fakeListLayout = (initialScrollTop: number) => {
      const list = screen.getByRole('listbox');
      let scrollTop = initialScrollTop;
      Object.defineProperty(list, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      });
      Object.defineProperty(list, 'clientHeight', {
        configurable: true,
        value: 200,
      });
      list.getBoundingClientRect = () => ({ top: 0, bottom: 200 }) as DOMRect;
      return list;
    };

    const placeRow = (index: number, top: number) => {
      screen.getAllByRole('option')[index].getBoundingClientRect = () =>
        ({ top, bottom: top + 40 }) as DOMRect;
    };

    it('scrolls down until the row clears the titles pinned at the bottom', () => {
      openPalette();
      const list = fakeListLayout(0);
      placeRow(1, 150);

      pressKey('ArrowDown');

      // The row ends at 190 but must end by 168
      expect(list.scrollTop).toBe(22);
    });

    it('scrolls up until the row clears the title pinned at the top', () => {
      openPalette();
      const list = fakeListLayout(100);
      placeRow(1, 60);
      pressKey('ArrowDown');
      placeRow(0, 10);

      pressKey('ArrowUp');

      // The row starts at 10 but must start at 32 or lower
      expect(list.scrollTop).toBe(78);
    });

    it('leaves the scroll alone when the row is already in view', () => {
      openPalette();
      const list = fakeListLayout(40);
      placeRow(1, 60);

      pressKey('ArrowDown');

      expect(list.scrollTop).toBe(40);
    });
  });

  describe('screen readers', () => {
    it('links the search box to the results list', () => {
      openPalette();

      expect(screen.getByRole('combobox')).toHaveAttribute(
        'aria-controls',
        screen.getByRole('listbox', { name: 'Search results' }).id,
      );
    });

    it('points the search box at the highlighted row', () => {
      openPalette();
      typeQuery('finance');

      const row = screen.getByRole('option', { name: /Finance/ });

      expect(row).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('combobox')).toHaveAttribute(
        'aria-activedescendant',
        row.id,
      );
    });

    it('announces how many results there are once the search finishes', async () => {
      openPalette();

      typeQuery('finance');
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('1 result'),
      );

      typeQuery('nothing-matches-this');
      // Silent while the text search is still running, then the count
      expect(screen.getByRole('status')).toHaveTextContent('');
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('0 results'),
      );
    });
  });

  describe('matching on the folder path', () => {
    beforeEach(() => {
      mockUseGetProjectFiles.mockReturnValue({
        data: projectTreeWith('models/staging/orders.sql', 'seeds/people.csv'),
      });
    });

    it('finds files inside a folder by the name of the folder', () => {
      openPalette();
      typeQuery('staging');

      expect(screen.getByText('orders.sql')).toBeInTheDocument();
      expect(screen.queryByText('people.csv')).not.toBeInTheDocument();
    });

    it('finds a file by a part of its path', () => {
      openPalette();
      typeQuery('staging/ord');

      expect(screen.getByText('orders.sql')).toBeInTheDocument();
    });

    it('treats back slashes in the search like forward slashes', () => {
      openPalette();
      typeQuery('STAGING\\ord');

      expect(screen.getByText('orders.sql')).toBeInTheDocument();
    });

    it('does not match on where the project itself is stored', () => {
      openPalette();
      typeQuery('projects/shop');

      expect(screen.queryByText('orders.sql')).not.toBeInTheDocument();
    });

    it('lists files matched by name before files matched by folder', () => {
      mockUseGetProjectFiles.mockReturnValue({
        data: projectTreeWith('orders/items.sql', 'zzz/orders.sql'),
      });
      openPalette();
      typeQuery('orders');

      const files = within(
        screen.getByRole('group', { name: 'Files' }),
      ).getAllByRole('option');
      expect(files[0]).toHaveTextContent('orders.sql');
      expect(files[1]).toHaveTextContent('items.sql');
    });

    it('leaves out what is inside the .git folder', () => {
      mockUseGetProjectFiles.mockReturnValue({
        data: projectTreeOf(
          folderNode('.git', [
            fileNode('.git/refs/orders'),
            folderNode('.git/orders'),
          ]),
          fileNode('orders.sql'),
        ),
      });
      openPalette();
      typeQuery('orders');

      expect(screen.getByText('orders.sql')).toBeInTheDocument();
      expect(screen.queryByText('Folders')).not.toBeInTheDocument();
      expect(within(sectionHeader('Files')).getByText('1')).toBeInTheDocument();
    });
  });

  describe('folders', () => {
    const stagingFolder = folderNode('models/staging', [
      fileNode('models/staging/orders.sql'),
    ]);

    beforeEach(() => {
      mockUseGetProjectFiles.mockReturnValue({
        data: projectTreeOf(folderNode('models', [stagingFolder])),
      });
    });

    it('lists a matching folder and where it is', () => {
      openPalette();
      typeQuery('staging');

      const folders = within(screen.getByRole('group', { name: 'Folders' }));
      expect(folders.getByText('staging')).toBeInTheDocument();
      expect(folders.getByText('models')).toBeInTheDocument();
    });

    it('lists folders before the files inside them', () => {
      openPalette();
      typeQuery('staging');

      const sectionNames = screen
        .getAllByRole('group')
        .map((group) => group.getAttribute('aria-label'));
      expect(sectionNames).toEqual(['Folders', 'Files']);
    });

    it('shows the folder in the file tree when chosen', async () => {
      openPalette();
      typeQuery('staging');

      fireEvent.click(
        within(screen.getByRole('group', { name: 'Folders' })).getByText(
          'staging',
        ),
      );

      expect(mockNavigate).toHaveBeenCalledWith('/app/dbt-project');
      expect(mockRevealFolderInTree).toHaveBeenCalledWith(
        `${PROJECT_PATH}/models/staging`,
      );
      expect(mockOpenFile).not.toHaveBeenCalled();
      await dialogIsClosed();
    });

    it('does not list the project folder itself', () => {
      openPalette();
      typeQuery('shop');

      expect(screen.queryByText('Folders')).not.toBeInTheDocument();
    });

    it('says how many folders are hidden when there are too many to list', () => {
      mockUseGetProjectFiles.mockReturnValue({
        data: projectTreeOf(
          ...Array.from({ length: 25 }, (_, index) =>
            folderNode(`area_${index}`),
          ),
        ),
      });
      openPalette();
      typeQuery('area_');

      expect(
        within(sectionHeader('Folders')).getByText('20 of 25'),
      ).toBeInTheDocument();
    });
  });

  describe('remembering the last search', () => {
    it('brings back the search with its text selected after choosing a result', async () => {
      openPalette();
      typeQuery('sql editor');

      fireEvent.click(screen.getByText('SQL Editor'));
      await reopenPalette();

      const searchBox = screen.getByRole('combobox') as HTMLInputElement;
      expect(searchBox).toHaveValue('sql editor');
      expect(searchBox.selectionStart).toBe(0);
      expect(searchBox.selectionEnd).toBe('sql editor'.length);
    });

    it('goes on to the next match without retyping', async () => {
      searchFinishesWith('a.sql');
      openPalette();
      typeQuery('zzword');
      fireEvent.click(await screen.findByText('Line 1'));
      expect(mockOpenFileAt).toHaveBeenLastCalledWith(
        expect.objectContaining({ line: 1 }),
      );

      await reopenPalette();
      await screen.findByText('Line 1');
      pressKey('ArrowDown');
      pressKey('ArrowDown');
      pressKey('Enter');

      expect(mockOpenFileAt).toHaveBeenLastCalledWith(
        expect.objectContaining({ line: 2 }),
      );
    });

    it('stays on the chosen row when reopened', async () => {
      searchFinishesWith('a.sql');
      openPalette();
      typeQuery('zzword');
      await screen.findByText('Line 2');
      pressKey('ArrowDown');
      pressKey('ArrowDown');
      pressKey('Enter');

      await reopenPalette();

      expect(highlightedOption()).toHaveTextContent('Line 2');
    });

    it('forgets the search when the project changes', async () => {
      const { rerender } = render(<CommandPalette />);
      fireEvent.click(screen.getByRole('button', { name: 'Search (Ctrl+K)' }));
      typeQuery('sql');
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      await dialogIsClosed();

      mockUseGetSelectedProject.mockReturnValue({
        data: { id: 'p2', name: 'Finance', path: '/projects/finance' },
      });
      rerender(<CommandPalette />);
      fireEvent.click(screen.getByRole('button', { name: 'Search (Ctrl+K)' }));

      expect(screen.getByRole('combobox')).toHaveValue('');
    });
  });

  describe('text matches grouped by file', () => {
    beforeEach(() => {
      searchFinishesWith('a.sql', 'b.sql');
    });

    const openWithMatches = async () => {
      openPalette();
      typeQuery('zzword');
      await screen.findByText('a.sql');
    };

    it('lists each file with its match count, followed by its matches', async () => {
      await openWithMatches();

      expect(optionLabels()).toEqual([
        'a.sql, 2 matches, expanded',
        'zzword one in a.sqlLine 1',
        'zzword two in a.sqlLine 2',
        'b.sql, 2 matches, expanded',
        'zzword one in b.sqlLine 1',
        'zzword two in b.sqlLine 2',
      ]);
    });

    it('counts all matches in the section title and the announcement, even when folded', async () => {
      await openWithMatches();

      fireEvent.click(screen.getByText('a.sql'));

      expect(
        within(sectionHeader('Text in files')).getByText('4'),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('4 results'),
      );
    });

    it('folds and unfolds a file when it is clicked, and stays open', async () => {
      await openWithMatches();

      fireEvent.click(screen.getByText('a.sql'));

      expect(optionLabels()).toEqual([
        'a.sql, 2 matches, collapsed',
        'b.sql, 2 matches, expanded',
        'zzword one in b.sqlLine 1',
        'zzword two in b.sqlLine 2',
      ]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(mockOpenFileAt).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('a.sql'));

      expect(optionLabels()).toHaveLength(6);
    });

    it('folds a file with Enter', async () => {
      await openWithMatches();

      pressKey('Enter');

      expect(highlightedOption()).toHaveAccessibleName(
        'a.sql, 2 matches, collapsed',
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('skips folded rows with the arrow keys', async () => {
      await openWithMatches();
      fireEvent.click(screen.getByText('a.sql'));

      pressKey('ArrowDown');

      expect(highlightedOption()).toHaveAccessibleName(
        'b.sql, 2 matches, expanded',
      );
    });

    it('folds with left and unfolds with right on a file row', async () => {
      await openWithMatches();
      pressKey('ArrowDown');
      pressKey('ArrowUp');

      pressKey('ArrowLeft');
      expect(highlightedOption()).toHaveAccessibleName(
        'a.sql, 2 matches, collapsed',
      );

      pressKey('ArrowRight');
      expect(highlightedOption()).toHaveAccessibleName(
        'a.sql, 2 matches, expanded',
      );
    });

    it('folds the file and moves up to it with left on a match', async () => {
      await openWithMatches();
      pressKey('ArrowDown');
      pressKey('ArrowDown');
      expect(highlightedOption()).toHaveTextContent('Line 2');

      pressKey('ArrowLeft');

      expect(highlightedOption()).toHaveAccessibleName(
        'a.sql, 2 matches, collapsed',
      );
    });

    it('leaves left and right to the text cursor until the list is walked', async () => {
      await openWithMatches();
      const searchBox = screen.getByRole('combobox');

      // fireEvent returns false when the key's default action was prevented
      expect(fireEvent.keyDown(searchBox, { key: 'ArrowLeft' })).toBe(true);
      expect(fireEvent.keyDown(searchBox, { key: 'ArrowRight' })).toBe(true);
      expect(optionLabels()).toHaveLength(6);
    });

    it('unfolds everything for a new search', async () => {
      await openWithMatches();
      fireEvent.click(screen.getByText('a.sql'));

      typeQuery('zzwords');
      await screen.findByText('a.sql');

      expect(optionLabels()).toHaveLength(6);
    });

    it('keeps the rows inside the pinned section for screen readers', async () => {
      await openWithMatches();

      const textSection = screen.getByRole('group', { name: 'Text in files' });
      expect(within(textSection).getAllByRole('option')).toHaveLength(6);
      expect(sectionHeader('Text in files')).toHaveStyle({
        position: 'sticky',
      });
    });
  });

  describe('without a selected project', () => {
    beforeEach(() => {
      mockUseGetSelectedProject.mockReturnValue({ data: undefined });
    });

    it('asks only for what it can search', () => {
      openPalette();

      expect(
        screen.getByPlaceholderText('Search screens and projects'),
      ).toBeInTheDocument();
    });

    it('does not offer the project screen', () => {
      openPalette();

      expect(screen.queryByText('DBT Studio')).not.toBeInTheDocument();
      expect(screen.getByText('SQL Editor')).toBeInTheDocument();
    });

    it('does not search file contents', async () => {
      openPalette();
      typeQuery('select');

      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 350);
        });
      });

      expect(mockSearchInFiles).not.toHaveBeenCalled();
    });
  });

  describe('choosing a result', () => {
    it('goes to a screen and closes', async () => {
      openPalette();

      fireEvent.click(screen.getByText('SQL Editor'));

      expect(mockNavigate).toHaveBeenCalledWith('/app/sql');
      await dialogIsClosed();
    });

    it('switches to a project', async () => {
      openPalette();

      fireEvent.click(screen.getByText('Finance'));

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/app/dbt-project'),
      );
      expect(mockSelectProject).toHaveBeenCalledWith({ projectId: 'p2' });
    });

    it('opens a file on the project page', () => {
      mockUseGetProjectFiles.mockReturnValue({
        data: projectTreeWith('models/orders.sql'),
      });
      openPalette();
      typeQuery('orders');

      fireEvent.click(screen.getByText('orders.sql'));

      expect(mockNavigate).toHaveBeenCalledWith('/app/dbt-project');
      expect(mockOpenFile).toHaveBeenCalledWith(
        `${PROJECT_PATH}/models/orders.sql`,
      );
    });

    it('opens a text match at its line', async () => {
      mockSearchInFiles.mockResolvedValue({
        results: [
          {
            path: `${PROJECT_PATH}/a.sql`,
            matches: [textMatch(9, '  select 1', 3, 6)],
          },
        ],
        truncated: false,
      });
      openPalette();
      typeQuery('select');

      fireEvent.click(await screen.findByText('Line 9'));

      expect(mockNavigate).toHaveBeenCalledWith('/app/dbt-project');
      expect(mockOpenFileAt).toHaveBeenCalledWith({
        path: `${PROJECT_PATH}/a.sql`,
        line: 9,
        column: 3,
        length: 6,
      });
    });

    it('moves through sections with the arrow keys and runs the row with Enter', () => {
      openPalette();
      typeQuery('s');

      // One step down per screen lands on the first row of the next section.
      const screenRows = Number(
        within(sectionHeader('Go to')).getByText(/^\d+$/).textContent,
      );
      for (let step = 0; step < screenRows; step += 1) pressKey('ArrowDown');
      pressKey('Enter');

      expect(mockSelectProject).toHaveBeenCalledWith({ projectId: 'p1' });
    });

    it('stops at the first and last rows', async () => {
      openPalette();
      typeQuery('finance');

      pressKey('ArrowUp');
      pressKey('ArrowDown');
      pressKey('ArrowDown');
      pressKey('Enter');

      await waitFor(() =>
        expect(mockSelectProject).toHaveBeenCalledWith({ projectId: 'p2' }),
      );
    });

    it('shows an error when switching project fails', async () => {
      mockSelectProject.mockRejectedValue(new Error('Project folder missing'));
      openPalette();

      fireEvent.click(screen.getByText('Finance'));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Project folder missing'),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('still highlights the first row when results arrive after pressing down on none', async () => {
      mockSearchInFiles.mockResolvedValue({
        results: [
          { path: `${PROJECT_PATH}/a.sql`, matches: [textMatch(4, 'zzword')] },
        ],
        truncated: false,
      });
      openPalette();
      typeQuery('zzword');

      // Nothing is listed until the text search answers
      pressKey('ArrowDown');
      await screen.findByText('Line 4');
      // The file's row comes first, then its match
      pressKey('ArrowDown');
      pressKey('Enter');

      expect(mockOpenFileAt).toHaveBeenCalledWith(
        expect.objectContaining({ path: `${PROJECT_PATH}/a.sql`, line: 4 }),
      );
    });

    it('does nothing on Enter when there are no results', () => {
      openPalette();
      typeQuery('nothing-matches-this');

      pressKey('Enter');

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
