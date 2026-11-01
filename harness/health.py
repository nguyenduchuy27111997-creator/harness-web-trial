#!/usr/bin/env python3
"""A snapshot of the machine and the loop, for `loop.py status`, the dashboard and /health.json.

Read-only and cheap (it runs every tick): load, memory pressure, free disk, whether the loop is offline,
paused or slept, and how long the oldest PR has waited for CI.
"""
import datetime
import os
import shutil
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
        "memory": memory_pressure(),
        "disk_free_gb": round(shutil.disk_usage(root).free / 1e9, 1),
        "offline_since": state.get("offline_since"),
        "paused_until": state.get("paused_until"),
        "pause_kind": state.get("pause_kind") if state.get("paused_until") else None,
        "sleeps": state.get("sleeps", 0),
        "ci_wait_minutes": max((m for m in ci if m is not None), default=None),
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
