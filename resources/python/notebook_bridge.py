import importlib.metadata as metadata
import json
import queue
import re
import sys
import threading

from jupyter_client import KernelManager


REQUIRED_PACKAGES = ("ipykernel", "jupyter_client", "nbformat")
MAX_TEXT_LENGTH = 64 * 1024
MAX_OUTPUT_BYTES = 5 * 1024 * 1024
ANSI_ESCAPE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def bounded_text(value):
    text = ANSI_ESCAPE.sub("", str(value))
    return text[:MAX_TEXT_LENGTH], len(text) > MAX_TEXT_LENGTH


def bounded_data(value):
    if not isinstance(value, str):
        return "", False
    encoded = value.encode("utf-8")
    if len(encoded) <= MAX_OUTPUT_BYTES:
        return value, False
    return encoded[:MAX_OUTPUT_BYTES].decode("utf-8", errors="ignore"), True


def emit_display(message_type, content, cell_id, execution_id):
    data = content.get("data", {})
    for mime in ("image/png", "image/jpeg", "text/html", "text/plain"):
        if mime in data:
            value, truncated = bounded_data(data[mime])
            emit({
                "type": "display-update" if message_type == "update_display_data" else "display",
                "cellId": cell_id,
                "executionId": execution_id,
                "mime": mime,
                "data": value,
                "text": data.get("text/plain", "") if mime != "text/plain" else value,
                "truncated": truncated,
            })
            return


def emit(event):
    print(json.dumps(event), flush=True)


def check_runtime():
    versions = {name: metadata.version(name) for name in REQUIRED_PACKAGES}
    manager = KernelManager(
        kernel_cmd=[
            sys.executable,
            "-m",
            "ipykernel_launcher",
            "-f",
            "{connection_file}",
        ]
    )
    client = None
    try:
        manager.start_kernel()
        client = manager.client()
        client.start_channels()
        client.wait_for_ready(timeout=15)
        return {"ok": True, "versions": versions}
    finally:
        if client is not None:
            client.stop_channels()
        if manager.has_kernel:
            manager.shutdown_kernel(now=True)


def convert_ipynb(command):
    import nbformat

    document = command.get("document")
    if not isinstance(document, dict):
        raise ValueError("Notebook document is invalid")
    notebook = nbformat.from_dict(document)
    nbformat.validate(notebook)
    return {"ok": True, "document": json.loads(nbformat.writes(notebook))}


def serve():
    manager = KernelManager(
        kernel_cmd=[
            sys.executable,
            "-m",
            "ipykernel_launcher",
            "-f",
            "{connection_file}",
        ]
    )
    client = None
    try:
        manager.start_kernel()
        client = manager.client()
        client.start_channels()
        client.wait_for_ready(timeout=15)

        commands = queue.Queue()

        def read_commands():
            for line in sys.stdin:
                commands.put(json.loads(line))
            commands.put({"operation": "shutdown"})

        threading.Thread(target=read_commands, daemon=True).start()

        should_shutdown = False
        while not should_shutdown:
            command = commands.get()
            operation = command.get("operation")
            if operation == "shutdown":
                break
            if operation == "interrupt":
                manager.interrupt_kernel()
                continue
            if operation == "restart":
                manager.restart_kernel(now=True)
                client.wait_for_ready(timeout=15)
                emit({"type": "session", "status": "idle"})
                continue
            if operation != "execute":
                continue

            execution_id = command.get("executionId")
            cell_id = command.get("cellId")
            if not isinstance(execution_id, str) or not isinstance(cell_id, str):
                continue
            message_id = client.execute(command.get("code", ""), store_history=True)
            saw_error = False
            restart_requested = False
            while True:
                try:
                    control = commands.get_nowait()
                    control_operation = control.get("operation")
                    if control_operation == "interrupt":
                        manager.interrupt_kernel()
                    elif control_operation == "restart":
                        restart_requested = True
                        manager.interrupt_kernel()
                    elif control_operation == "shutdown":
                        should_shutdown = True
                        manager.interrupt_kernel()
                except queue.Empty:
                    pass

                try:
                    message = client.get_iopub_msg(timeout=0.1)
                except queue.Empty:
                    continue
                parent_id = message.get("parent_header", {}).get("msg_id")
                if parent_id != message_id:
                    continue
                message_type = message.get("msg_type")
                content = message.get("content", {})
                if message_type == "stream":
                    text, truncated = bounded_text(content.get("text", ""))
                    emit({
                        "type": "stream",
                        "cellId": cell_id,
                        "executionId": execution_id,
                        "text": text,
                        "truncated": truncated,
                    })
                elif message_type == "execute_result":
                    emit_display(message_type, content, cell_id, execution_id)
                elif message_type in ("display_data", "update_display_data"):
                    emit_display(message_type, content, cell_id, execution_id)
                elif message_type == "clear_output":
                    emit({
                        "type": "clear-output",
                        "cellId": cell_id,
                        "executionId": execution_id,
                        "wait": bool(content.get("wait", False)),
                    })
                elif message_type == "error":
                    saw_error = True
                    text, truncated = bounded_text("\n".join(content.get("traceback", [])))
                    emit({
                        "type": "error",
                        "cellId": cell_id,
                        "executionId": execution_id,
                        "name": content.get("ename", "PythonError"),
                        "text": text,
                        "truncated": truncated,
                    })
                elif message_type == "status" and content.get("execution_state") == "idle":
                    while True:
                        reply = client.get_shell_msg(timeout=5)
                        if reply.get("parent_header", {}).get("msg_id") == message_id:
                            break
                    emit({
                        "type": "status",
                        "cellId": cell_id,
                        "executionId": execution_id,
                        "status": "error" if saw_error else "success",
                    })
                    break
            if restart_requested and not should_shutdown:
                manager.restart_kernel(now=True)
                client.wait_for_ready(timeout=15)
                emit({"type": "session", "status": "idle"})
    finally:
        if client is not None:
            client.stop_channels()
        if manager.has_kernel:
            manager.shutdown_kernel(now=True)


def main():
    if "--serve" in sys.argv:
        serve()
        return
    command = json.load(sys.stdin)
    if command.get("operation") == "check":
        print(json.dumps(check_runtime()))
        return
    if command.get("operation") in ("import", "export"):
        print(json.dumps(convert_ipynb(command)))
        return
    raise ValueError("Unsupported notebook bridge operation")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        if "--serve" in sys.argv:
            emit({"type": "bridge-error", "error": str(error)})
        else:
            print(json.dumps({"ok": False, "error": str(error)}))
        sys.exit(1)
