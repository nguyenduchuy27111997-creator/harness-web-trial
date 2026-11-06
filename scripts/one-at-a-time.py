#!/usr/bin/env python3
"""Run a command once no other run of it holds the machine's lock, used by scripts/check.sh for e2e:
  python3 scripts/one-at-a-time.py NAME CMD...

Playwright already spreads one suite over the CPUs. In the web trial two lanes ran their suites at once
on a busy machine (load 50-125), and F044's and F048's sessions spent most of their 90 minutes rerunning
the suite, failing each time on timeouts in unrelated specs. The lock is per machine (every project and
worktree), released when the command exits, however it exits.
"""
import fcntl
import os
import sys
import time

name, cmd = sys.argv[1], sys.argv[2:]
lock = open(os.path.join(os.environ.get("HARNESS_LOCK_DIR", "/tmp"), f"harness-{name}.lock"), "w")
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    print(f"one-at-a-time: another {name} run holds the lock; waiting", flush=True)
    start = time.time()
    fcntl.flock(lock, fcntl.LOCK_EX)
    print(f"one-at-a-time: waited {time.time() - start:.0f}s", flush=True)
os.set_inheritable(lock.fileno(), True)  # the lock lives as long as the command
os.execvp(cmd[0], cmd)
