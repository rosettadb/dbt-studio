const { EventEmitter } = require('events');

// One emitter shared by all runs; events are namespaced by run id so late
// SSE subscribers only need to replay that run's buffered lines.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const buffers = new Map(); // runId -> string[]

function appendLog(runId, line) {
  if (!buffers.has(runId)) buffers.set(runId, []);
  buffers.get(runId).push(line);
  emitter.emit(`log:${runId}`, line);
}

function getBuffer(runId) {
  return buffers.get(runId) || [];
}

function emitStatus(runId, status) {
  emitter.emit(`status:${runId}`, status);
}

function clearBuffer(runId) {
  buffers.delete(runId);
}

module.exports = { emitter, appendLog, getBuffer, emitStatus, clearBuffer };
