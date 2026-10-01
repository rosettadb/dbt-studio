const createConnection = jest.fn(() => ({
  connect: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue([[], []]),
  end: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn(),
  release: jest.fn(),
}));

const mysqlMock = {
  createConnection,
  createPool: jest.fn(),
  escape: jest.fn((value: unknown) => String(value)),
  format: jest.fn(),
};

export default mysqlMock;