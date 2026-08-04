#!/usr/bin/env python3
"""
Native Messaging Host for Image Saver extension.
Receives image data from the browser extension and saves it to a local folder.

Protocol: Chrome/Opera native messaging (4-byte little-endian length prefix + JSON)
"""

import sys
import os
import json
import struct
import base64
import time
from pathlib import Path


def set_binary_mode():
    """Force stdin/stdout to binary mode on Windows."""
    if sys.platform == "win32":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def read_message():
    """Read a native messaging message from stdin."""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    length = struct.unpack("<I", raw_length)[0]
    if length == 0:
        return None
    data = sys.stdin.buffer.read(length)
    if len(data) < length:
        return None
    return json.loads(data.decode("utf-8"))


def send_message(message):
    """Send a native messaging message to stdout."""
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def handle_ping(msg):
    """Handle ping/test connection message."""
    save_path = msg.get("savePath", "")
    if not save_path:
        return {"success": False, "error": "No save path provided"}

    path = Path(save_path)
    try:
        path.mkdir(parents=True, exist_ok=True)
        return {"success": True, "savePath": str(path.resolve())}
    except Exception as e:
        return {"success": False, "error": f"Cannot create directory: {e}"}


def handle_save(msg):
    """Handle image save request."""
    image_data_b64 = msg.get("imageData")
    filename = msg.get("filename", "image.jpg")
    save_path = msg.get("savePath", "")

    if not image_data_b64:
        return {"success": False, "error": "No image data received"}

    if not save_path:
        return {"success": False, "error": "No save path provided"}

    try:
        # Decode base64 image data
        image_bytes = base64.b64decode(image_data_b64)
    except Exception as e:
        return {"success": False, "error": f"Failed to decode image data: {e}"}

    # Ensure the save directory exists
    save_dir = Path(save_path)
    try:
        save_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return {"success": False, "error": f"Cannot create save directory: {e}"}

    # Resolve filename collisions
    target = save_dir / filename
    if target.exists():
        stem = target.stem
        suffix = target.suffix
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"{stem}_{timestamp}{suffix}"
        target = save_dir / filename

    # Write the file
    try:
        target.write_bytes(image_bytes)
        return {
            "success": True,
            "filename": target.name,
            "path": str(target.resolve()),
            "size": len(image_bytes),
        }
    except PermissionError:
        return {"success": False, "error": f"Permission denied: {target}"}
    except Exception as e:
        return {"success": False, "error": f"Failed to write file: {e}"}


def main():
    set_binary_mode()

    while True:
        try:
            msg = read_message()
        except Exception as e:
            # If stdin is closed or error, exit
            break

        if msg is None:
            break

        msg_type = msg.get("type", "")

        if msg_type == "ping":
            response = handle_ping(msg)
        elif msg_type == "save":
            response = handle_save(msg)
        else:
            response = {"success": False, "error": f"Unknown message type: {msg_type}"}

        try:
            send_message(response)
        except Exception:
            break


if __name__ == "__main__":
    main()
