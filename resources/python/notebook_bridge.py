import importlib.metadata as metadata
import json
import sys

from jupyter_client import KernelManager


REQUIRED_PACKAGES = ("ipykernel", "jupyter_client", "nbformat")


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


def main():
    command = json.load(sys.stdin)
    if command.get("operation") != "check":
        raise ValueError("Unsupported notebook bridge operation")
    print(json.dumps(check_runtime()))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        sys.exit(1)
