export const installIpcRendererMock = () => {
  (window as any).electron = {
    ipcRenderer: {
      sendMessage: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
      invoke: jest.fn(),
    },
  };
};
