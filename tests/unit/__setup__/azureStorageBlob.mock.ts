export const BlobServiceClient = {
  fromConnectionString: jest.fn(),
};

export const StorageSharedKeyCredential = jest.fn();

export const generateBlobSASQueryParameters = jest.fn(() => ({
  toString: () => '',
}));

export const BlobSASPermissions = {
  parse: jest.fn(() => ({})),
};
