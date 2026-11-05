#!/usr/bin/env python3
"""A snapshot of the machine and the loop, for `loop.py status`, the dashboard and /health.json.

Read-only and cheap (it runs every tick): load, memory pressure and use, free disk, whether the loop is offline,
paused or slept, how long the oldest PR has waited for CI; and for the office's server rack (DESIGN.md 14.14) the
loop's own processes (sessions, dev servers, the office's Chrome) with their CPU and memory, the CI runner as the loop
last saw it, and which local services answer (Supabase, Postgres, Docker).
"""
import datetime
import os
import shutil
import socket
import subprocess
import sys

PRESSURE = {1: "normal", 2: "warn", 4: "critical"}  # macOS kern.memorystatus_vm_pressure_level


def memory_pressure():
    if sys.platform != "darwin":
        return None
    try:
        out = subprocess.run(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], capture_output=True,
                             text=True, timeout=5).stdout.strip()
        return PRESSURE.get(int(out), out or None)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def memory_used():
    """Percent of RAM in use (macOS vm_stat: active + wired + compressed over all pages), or None."""
    if sys.platform != "darwin":
        return None
    try:
        out = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5).stdout
        pages = {k.strip(): int(v.strip().rstrip(".")) for k, v in (line.split(":", 1) for line in out.splitlines()[1:] if ":" in line)}
        used = pages.get("Pages active", 0) + pages.get("Pages wired down", 0) + pages.get("Pages occupied by compressor", 0)
        total = used + pages.get("Pages free", 0) + pages.get("Pages inactive", 0) + pages.get("Pages speculative", 0)
        return round(100 * used / total) if total else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


KINDS = (("claude", "session"), ("next-server", "dev server"), ("next dev", "dev server"), ("node", "node"),
         ("Chrome", "office chrome"), ("chrome", "office chrome"), ("playwright", "browser"), ("python", "python"))


def processes(root_pid):
    """The loop's descendants, with what they are, their CPU percent and resident memory in MB."""
    try:
        out = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,pcpu=,rss=,command="], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.TimeoutExpired):
        return []
    rows = {}
    for line in out.splitlines():
        parts = line.split(None, 4)
        if len(parts) == 5 and parts[0].isdigit():
            rows[int(parts[0])] = (int(parts[1]), float(parts[2]), int(parts[3]), parts[4])
    mine, todo = [], [root_pid]
    while todo:
        p = todo.pop()
        for pid, (ppid, cpu, rss, cmd) in rows.items():
            if ppid == p:
                todo.append(pid)
                kind = next((k for needle, k in KINDS if needle in cmd), "other")
                mine.append({"pid": pid, "kind": kind, "cpu": round(cpu), "mb": round(rss / 1024)})
    return sorted(mine, key=lambda r: -r["cpu"])[:40]


SERVICES = (("Supabase API", 54321), ("Supabase DB", 54322), ("Postgres", 5432))


def services():
    """Which local services answer on their usual ports (a 0.2 s connect each), and whether Docker's socket is there."""
    out = []
    for name, port in SERVICES:
        with socket.socket() as s:
            s.settimeout(0.2)
            out.append({"name": name, "port": port, "up": s.connect_ex(("127.0.0.1", port)) == 0})
    out.append({"name": "Docker", "port": None, "up": any(os.path.exists(os.path.expanduser(p)) for p in
                                                          ("/var/run/docker.sock", "~/.docker/run/docker.sock"))})
    return out


def age_minutes(stamp, now):
    try:
        return round((now - datetime.datetime.fromisoformat(stamp)).total_seconds() / 60)
    except (TypeError, ValueError):
        return None


def snapshot(state, root, now=None):
    now = now or datetime.datetime.now()
    load = os.getloadavg()[0] if hasattr(os, "getloadavg") else None
    ci = [age_minutes(j.get("updated"), now) for j in state.get("jobs", {}).values() if j.get("stage") == "ci"]
    return {
        "at": now.isoformat(timespec="seconds"),
        "load": round(load, 2) if load is not None else None, "cpus": os.cpu_count(),
        "memory": memory_pressure(), "memory_used": memory_used(),
        "disk_free_gb": round(shutil.disk_usage(root).free / 1e9, 1),
        "offline_since": state.get("offline_since"),
        "paused_until": state.get("paused_until"),
        "pause_kind": state.get("pause_kind") if state.get("paused_until") else None,
        "sleeps": state.get("sleeps", 0),
        "ci_wait_minutes": max((m for m in ci if m is not None), default=None),
        "processes": processes(os.getpid()), "services": services(),
        "runner": {"self_hosted": state.get("self_hosted"), "restarts": len(state.get("runner_restarts") or []),
                   "blocked": bool(state.get("ci_blocked")), "stalled": bool(state.get("ci_stalled"))},
    }


def line(h):
    """One line for `loop.py status`."""
    parts = [f"load {h['load']}/{h['cpus']} cpu" if h.get("load") is not None else None,
             f"memory {h['memory']}" if h.get("memory") else None,
             f"disk {h['disk_free_gb']} GB free",
             f"offline since {h['offline_since']}" if h.get("offline_since") else None,
             f"paused ({h['pause_kind']})" if h.get("pause_kind") else None,
             f"slept {h['sleeps']}x" if h.get("sleeps") else None,
             f"oldest CI wait {h['ci_wait_minutes']} min" if h.get("ci_wait_minutes") is not None else None]
    return " · ".join(p for p in parts if p)
