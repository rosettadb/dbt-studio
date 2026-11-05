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

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
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
  useTabs: () => ({ openFile: mockOpenFile, openFileAt: mockOpenFileAt }),
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
  fireEvent.change(screen.getByRole('textbox'), { target: { value: query } });
};

const pressKey = (key: string) => {
  fireEvent.keyDown(screen.getByRole('textbox'), { key });
};

const sectionHeader = (title: string) =>
  screen.getByText(title).parentElement as HTMLElement;

const dialogIsClosed = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

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

    it('clears the search when closed with Escape', async () => {
      openPalette();
      typeQuery('sql');

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      await dialogIsClosed();
      fireEvent.click(screen.getByRole('button', { name: 'Search (Ctrl+K)' }));

      expect(screen.getByRole('textbox')).toHaveValue('');
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

      expect(
        await screen.findByText('models/orders.sql · line 9'),
      ).toBeInTheDocument();
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
      expect(screen.getByText('b.sql · line 10')).toBeInTheDocument();
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
      await screen.findByText('new.sql · line 1');
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

      expect(screen.queryByText('old.sql · line 1')).not.toBeInTheDocument();
      expect(screen.getByText('new.sql · line 1')).toBeInTheDocument();
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

      fireEvent.click(await screen.findByText('a.sql · line 9'));

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

    it('does nothing on Enter when there are no results', () => {
      openPalette();
      typeQuery('nothing-matches-this');

      pressKey('Enter');

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
