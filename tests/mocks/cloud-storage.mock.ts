export const mockS3 = {
  listObjects: jest.fn(),
  getObject: jest.fn(),
  putObject: jest.fn(),
};

export const mockAzureBlob = {
  listContainers: jest.fn(),
  listBlobs: jest.fn(),
  download: jest.fn(),
  upload: jest.fn(),
};

export const mockGcs = {
  listBuckets: jest.fn(),
  listFiles: jest.fn(),
  download: jest.fn(),
  upload: jest.fn(),
};
