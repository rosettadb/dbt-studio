import importlib.metadata as metadata
import json
import sys

from jupyter_client import KernelManager


REQUIRED_PACKAGES = ("ipykernel", "jupyter_client", "nbformat")
MAX_TEXT_LENGTH = 64 * 1024


def bounded_text(value):
    text = str(value)
    return text[:MAX_TEXT_LENGTH], len(text) > MAX_TEXT_LENGTH


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

        for line in sys.stdin:
            command = json.loads(line)
            if command.get("operation") == "shutdown":
                break
            if command.get("operation") != "execute":
                continue

            execution_id = command.get("executionId")
            cell_id = command.get("cellId")
            if not isinstance(execution_id, str) or not isinstance(cell_id, str):
                continue
            message_id = client.execute(command.get("code", ""), store_history=True)
            saw_error = False
            while True:
                message = client.get_iopub_msg(timeout=30)
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
                    text, truncated = bounded_text(
                        content.get("data", {}).get("text/plain", "")
                    )
                    emit({
                        "type": "result",
                        "cellId": cell_id,
                        "executionId": execution_id,
                        "text": text,
                        "truncated": truncated,
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
    if command.get("operation") != "check":
        raise ValueError("Unsupported notebook bridge operation")
    print(json.dumps(check_runtime()))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        if "--serve" in sys.argv:
            emit({"type": "bridge-error", "error": str(error)})
        else:
            print(json.dumps({"ok": False, "error": str(error)}))
        sys.exit(1)
