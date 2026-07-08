#!/usr/bin/env python3
"""Lightweight launcher for VirtualTabletop with log window and quit button."""

import os
import sys
import subprocess
import threading
import tkinter as tk
from queue import Queue
from pathlib import Path

HERE = Path(__file__).resolve().parent
_REPO = HERE.parent
VTT_ROOT = _REPO if (_REPO / "server.mjs").exists() else HERE / "vtt"
PORT = 8272


def find_node():
    appdir = os.environ.get("APPDIR")
    if appdir:
        node_path = Path(appdir) / "usr" / "bin" / "node"
        if node_path.exists():
            return str(node_path)
    return "node"


def find_vtt_root():
    appdir = os.environ.get("APPDIR")
    if appdir:
        vtt = Path(appdir) / "vtt" / "server.mjs"
        if vtt.exists():
            return Path(appdir) / "vtt"
    return VTT_ROOT.resolve()


def stream_reader(pipe, queue, prefix=""):
    for line in iter(pipe.readline, ""):
        if line:
            queue.put((prefix, line.rstrip()))


def main():
    vtt_root = find_vtt_root()
    server_script = vtt_root / "server.mjs"
    if not server_script.exists():
        sys.exit(f"Server not found: {server_script}")

    node = find_node()
    if node != "node" and not Path(node).exists():
        sys.exit(f"Node binary not found: {node}")

    save_dir = os.path.expanduser("~/.virtualtabletop") if os.environ.get("APPDIR") else None

    root = tk.Tk()
    root.title("VirtualTabletop")
    root.minsize(400, 360)
    root.geometry("640x520")

    log_frame = tk.Frame(root)
    log_frame.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

    scrollbar = tk.Scrollbar(log_frame)
    scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

    log_text = tk.Text(
        log_frame, wrap=tk.WORD, yscrollcommand=scrollbar.set,
        font=("Liberation Mono", 10), bg="#1a1a1a", fg="#e0e0e0",
        insertbackground="#e0e0e0"
    )
    log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
    scrollbar.config(command=log_text.yview)

    log_text.tag_config("stderr", foreground="#f59e0b")
    log_text.tag_config("error", foreground="#ef4444")

    def append_log(prefix, line):
        if prefix == "stderr":
            log_text.insert(tk.END, line + "\n", "stderr")
        else:
            log_text.insert(tk.END, line + "\n")
        log_text.see(tk.END)
        root.update_idletasks()

    queue = Queue()

    def process_queue():
        while True:
            try:
                prefix, line = queue.get_nowait()
                append_log(prefix, line)
            except Exception:
                break
        root.after(100, process_queue)

    root.after(100, process_queue)

    bar = tk.Frame(root)
    bar.pack(fill=tk.X, padx=8, pady=(0, 8))
    bar.columnconfigure(0, weight=1)

    if save_dir:
        path_label = tk.Label(bar, text=f"Save: {save_dir}", fg="#888", font=("", 9))
        path_label.pack(side=tk.LEFT, padx=(0, 16))

    link = tk.Label(bar, text=f"Open http://localhost:{PORT} in your browser", fg="#60a5fa", cursor="hand2")
    link.pack(side=tk.LEFT)
    link.bind("<Button-1>", lambda e: os.system(f"xdg-open http://localhost:{PORT} &"))

    def quit_app():
        if proc and proc.poll() is None:
            proc.terminate()
            proc.wait()
        root.destroy()

    quit_btn = tk.Button(bar, text="Quit", command=quit_app, bg="#dc2626", fg="white", cursor="hand2",
                        relief=tk.FLAT, padx=16, pady=4)
    quit_btn.pack(side=tk.RIGHT)

    cwd = str(vtt_root)
    env = os.environ.copy()
    if save_dir:
        os.makedirs(save_dir, exist_ok=True)
        os.makedirs(save_dir + "/assets", exist_ok=True)
        env["VTT_SAVE_DIR"] = save_dir
    proc = subprocess.Popen(
        [str(node), str(server_script)],
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    threading.Thread(target=stream_reader, args=(proc.stdout, queue), daemon=True).start()
    threading.Thread(target=stream_reader, args=(proc.stderr, queue, "stderr"), daemon=True).start()

    append_log("", f"VirtualTabletop starting on port {PORT}...")
    append_log("", f"Open http://localhost:{PORT} in your browser")

    root.protocol("WM_DELETE_WINDOW", quit_app)
    root.mainloop()
    quit_app()


if __name__ == "__main__":
    main()
