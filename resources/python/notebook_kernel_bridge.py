"""
Rosetta Studio notebook kernel bridge.

Runs inside a notebook's virtualenv. Launches a real Jupyter kernel
(ipykernel) in the same environment via jupyter_client and relays the Jupyter
messaging protocol to the Electron main process as newline-delimited JSON over
stdin / stdout. This keeps ZeroMQ entirely on the Python side (pyzmq ships
wheels for every platform we support) so no native module is needed in
Electron.

Commands (stdin, one JSON object per line):
    {"op": "execute", "id": "<request id>", "code": "<source>"}
    {"op": "interrupt"}
    {"op": "shutdown"}

Events (stdout, one JSON object per line):
    {"type": "ready", "kernel_info": {...}}
    {"type": "status", "status": "busy" | "idle"}
    {"type": "output", "id": "<request id>", "output": {<nbformat output>}}
    {"type": "clear_output", "id": "<request id>"}
    {"type": "execute_done", "id": "<request id>", "status": "ok|error|abort",
     "execution_count": <int|null>}
    {"type": "log", "message": "..."}
    {"type": "fatal", "message": "..."}
"""

import json
import os
import sys
import threading
import traceback

# --------------------------------------------------------------------------
# Protect the JSON channel: anything the kernel subprocess (or a stray print)
# writes to fd 1 must not corrupt our stream. Keep a private handle to the real
# stdout and point fd 1 at stderr.
# --------------------------------------------------------------------------
_out_fd = os.dup(1)
os.dup2(2, 1)
_out = os.fdopen(_out_fd, "w", encoding="utf-8", buffering=1, newline="\n")
_out_lock = threading.Lock()


def emit(event):
    with _out_lock:
        _out.write(json.dumps(event, ensure_ascii=False))
        _out.write("\n")
        _out.flush()


def log(message):
    emit({"type": "log", "message": str(message)})


try:
    from jupyter_client import KernelManager
except Exception as exc:  # pragma: no cover - reported to the app
    emit({"type": "fatal", "message": "jupyter_client is not installed: %s" % exc})
    sys.exit(2)


def _join(value):
    if isinstance(value, list):
        return "".join(value)
    return value if value is not None else ""


def _normalise_bundle(data):
    result = {}
    for mime, value in (data or {}).items():
        result[mime] = _join(value) if isinstance(value, list) else value
    return result


class Bridge:
    def __init__(self):
        self.km = KernelManager()
        self.kc = None
        # parent msg_id -> request id
        self.requests = {}
        # request id -> {"reply": bool, "idle": bool, "status": str, "count": int}
        self.progress = {}
        self.lock = threading.Lock()
        self.stopping = threading.Event()
        self.threads = []

    # ----------------------------------------------------------------- start
    def start(self):
        cwd = os.getcwd()
        self.km.start_kernel(cwd=cwd)
        self.kc = self.km.client()
        self.kc.start_channels()
        self.kc.wait_for_ready(timeout=120)
        info = {}
        try:
            reply = self.kc.kernel_info(reply=True, timeout=30)
            content = reply.get("content", {})
            info = {
                "implementation": content.get("implementation"),
                "implementation_version": content.get("implementation_version"),
                "language_info": content.get("language_info", {}),
            }
        except Exception as exc:  # pragma: no cover
            log("kernel_info failed: %s" % exc)
        emit({"type": "ready", "kernel_info": info})

        self.threads = [
            threading.Thread(target=self._iopub_loop, daemon=True),
            threading.Thread(target=self._shell_loop, daemon=True),
        ]
        for thread in self.threads:
            thread.start()

    # ------------------------------------------------------------ execution
    def execute(self, request_id, code):
        msg_id = self.kc.execute(
            code,
            silent=False,
            store_history=True,
            allow_stdin=False,
            stop_on_error=False,
        )
        with self.lock:
            self.requests[msg_id] = request_id
            self.progress[request_id] = {
                "reply": False,
                "idle": False,
                "status": "ok",
                "count": None,
            }

    def interrupt(self):
        try:
            self.km.interrupt_kernel()
        except Exception as exc:
            log("interrupt failed: %s" % exc)

    def shutdown(self):
        self.stopping.set()
        # Let the reader threads observe `stopping` before the channels are
        # torn down underneath them.
        for thread in getattr(self, "threads", []):
            thread.join(timeout=3)
        try:
            if self.kc is not None:
                self.kc.stop_channels()
        except Exception:
            pass
        try:
            self.km.shutdown_kernel(now=True)
        except Exception:
            pass

    def _request_for(self, msg):
        parent = msg.get("parent_header") or {}
        return self.requests.get(parent.get("msg_id"))

    def _maybe_done(self, request_id):
        state = self.progress.get(request_id)
        if not state or not (state["reply"] and state["idle"]):
            return
        emit(
            {
                "type": "execute_done",
                "id": request_id,
                "status": state["status"],
                "execution_count": state["count"],
            }
        )
        with self.lock:
            self.progress.pop(request_id, None)
            for msg_id, rid in list(self.requests.items()):
                if rid == request_id:
                    self.requests.pop(msg_id, None)

    # ------------------------------------------------------------- iopub
    def _iopub_loop(self):
        while not self.stopping.is_set():
            try:
                msg = self.kc.get_iopub_msg(timeout=1)
            except Exception:
                continue
            try:
                self._handle_iopub(msg)
            except Exception as exc:  # pragma: no cover
                log("iopub handler error: %s\n%s" % (exc, traceback.format_exc()))

    def _handle_iopub(self, msg):
        msg_type = msg.get("msg_type")
        content = msg.get("content", {})
        request_id = self._request_for(msg)

        if msg_type == "status":
            state = content.get("execution_state")
            if state in ("busy", "idle"):
                emit({"type": "status", "status": state})
            if state == "idle" and request_id is not None:
                with self.lock:
                    st = self.progress.get(request_id)
                    if st:
                        st["idle"] = True
                self._maybe_done(request_id)
            return

        if request_id is None:
            return

        if msg_type == "stream":
            emit(
                {
                    "type": "output",
                    "id": request_id,
                    "output": {
                        "output_type": "stream",
                        "name": content.get("name", "stdout"),
                        "text": _join(content.get("text", "")),
                    },
                }
            )
        elif msg_type in ("display_data", "update_display_data"):
            emit(
                {
                    "type": "output",
                    "id": request_id,
                    "output": {
                        "output_type": "display_data",
                        "data": _normalise_bundle(content.get("data")),
                        "metadata": content.get("metadata", {}),
                    },
                }
            )
        elif msg_type == "execute_result":
            emit(
                {
                    "type": "output",
                    "id": request_id,
                    "output": {
                        "output_type": "execute_result",
                        "execution_count": content.get("execution_count"),
                        "data": _normalise_bundle(content.get("data")),
                        "metadata": content.get("metadata", {}),
                    },
                }
            )
        elif msg_type == "error":
            emit(
                {
                    "type": "output",
                    "id": request_id,
                    "output": {
                        "output_type": "error",
                        "ename": content.get("ename", ""),
                        "evalue": content.get("evalue", ""),
                        "traceback": content.get("traceback", []),
                    },
                }
            )
        elif msg_type == "clear_output":
            emit({"type": "clear_output", "id": request_id})

    # ------------------------------------------------------------- shell
    def _shell_loop(self):
        while not self.stopping.is_set():
            try:
                msg = self.kc.get_shell_msg(timeout=1)
            except Exception:
                continue
            if msg.get("msg_type") != "execute_reply":
                continue
            request_id = self._request_for(msg)
            if request_id is None:
                continue
            content = msg.get("content", {})
            with self.lock:
                st = self.progress.get(request_id)
                if st:
                    st["reply"] = True
                    st["status"] = content.get("status", "ok")
                    st["count"] = content.get("execution_count")
            self._maybe_done(request_id)


def main():
    bridge = Bridge()
    try:
        bridge.start()
    except Exception as exc:
        emit(
            {
                "type": "fatal",
                "message": "Failed to start kernel: %s\n%s"
                % (exc, traceback.format_exc()),
            }
        )
        bridge.shutdown()
        sys.exit(3)

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                command = json.loads(line)
            except ValueError:
                log("ignoring malformed command")
                continue
            op = command.get("op")
            if op == "execute":
                bridge.execute(command.get("id"), command.get("code", ""))
            elif op == "interrupt":
                bridge.interrupt()
            elif op == "shutdown":
                break
            else:
                log("unknown op: %r" % op)
    finally:
        bridge.shutdown()


if __name__ == "__main__":
    main()
