// Main-process half. Runs in Node, inside Studio's main process.
// Everything registered through `api` is removed when the extension is
// disabled or uninstalled.

exports.activate = (api) => {
  // Answers api.ipc.invoke('hello:greet', name) from the UI half.
  // Channel names are global, so they carry the extension's name.
  api.ipc.handle('hello:greet', (_event, name) => `Hello, ${name}!`);

  api.log.info('activated');
};

exports.deactivate = () => {
  // Stop anything started outside `api` here (timers, child processes).
};
