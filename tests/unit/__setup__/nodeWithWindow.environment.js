/**
 * Node test environment for main-process code that needs Node's native
 * fetch, Response and web streams (jsdom hides them). It defines `window`
 * only so the shared setup file (renderer IPC mock) still runs.
 * Use with: @jest-environment ./tests/unit/__setup__/nodeWithWindow.environment.js
 */
const { TestEnvironment } = require('jest-environment-node');

class NodeWithWindowEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    this.global.window = this.global;
  }
}

module.exports = NodeWithWindowEnvironment;
