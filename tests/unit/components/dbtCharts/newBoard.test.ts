import {
  slugPreview,
  validateBoardName,
} from '../../../../src/renderer/components/dbtCharts/NewBoardDialog';

describe('new board name', () => {
  it('slugifies names', () => {
    expect(slugPreview('Sales Overview!')).toBe('sales-overview');
    expect(slugPreview('team/Sales')).toBe('team/sales');
  });

  it('validates empty, traversal and duplicates', () => {
    expect(validateBoardName('', [])).toMatch(/Enter/);
    expect(validateBoardName('../x', [])).toMatch(/inside/);
    expect(validateBoardName('Sales', ['charts/sales.yml'])).toMatch(
      /already exists/,
    );
    expect(validateBoardName('Sales', [])).toBeNull();
  });
});
