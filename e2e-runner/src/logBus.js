const { EventEmitter } = require('events');

// One emitter shared by all runs; events are namespaced by run id so late
// SSE subscribers only need to replay that run's buffered lines.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const buffers = new Map(); // runId -> string[]

/**
 * Buffers one output line for a run and emits it to any live SSE subscribers.
 *
 * @param {number} runId Run the line belongs to.
 * @param {string} line A single line of output, without a trailing newline.
 */
function appendLog(runId, line) {
  if (!buffers.has(runId)) buffers.set(runId, []);
  buffers.get(runId).push(line);
  emitter.emit(`log:${runId}`, line);
}

/**
 * Returns the lines buffered so far for a run, so a subscriber that connects
 * mid-run can replay the output it missed.
 *
 * @param {number} runId Run to read.
 * @returns {string[]} Buffered lines, empty if the run has none.
 */
function getBuffer(runId) {
  return buffers.get(runId) || [];
}

/**
 * Notifies subscribers that a run changed status. Not buffered — subscribers
 * read the current status from the database when they connect.
 *
 * @param {number} runId Run that changed.
 * @param {string} status New status, e.g. "running" or "passed".
 */
function emitStatus(runId, status) {
  emitter.emit(`status:${runId}`, status);
}

/**
 * Drops a run's buffered lines. The run's output.log on disk is unaffected, so
 * subscribers can still replay it from there.
 *
 * @param {number} runId Run to forget.
 */
function clearBuffer(runId) {
  buffers.delete(runId);
}

module.exports = { emitter, appendLog, getBuffer, emitStatus, clearBuffer };
