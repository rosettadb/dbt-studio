export function createMockIpcMain() {
  const handlers = new Map<string, Function>();

  return {
    handle: (channel: string, handler: Function) => {
      handlers.set(channel, handler);
    },
    invoke: async (channel: string, ...args: any[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for channel: ${channel}`);
      return handler({ sender: {} }, ...args);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
    _handlers: handlers,
  };
}
