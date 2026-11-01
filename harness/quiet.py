#!/usr/bin/env python3
"""Wait for a quiet machine before a timing check (a latency or Lighthouse budget) on a self-hosted runner
the build loop's sessions share. Seen for real: a p99 budget failed at 109 ms against 50 while three lanes
ran on the same Mac. Always exits 0: it only waits, the check still decides.

  quiet.py [--max 300] [--load 1.0]    load average per CPU to wait for, at most --max seconds
"""
import argparse
import os
import time


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--max", type=float, default=300)
    p.add_argument("--load", type=float, default=1.0)
    a = p.parse_args()
    cpus, began = os.cpu_count() or 1, time.monotonic()
    while True:
        load = os.getloadavg()[0]
        waited = time.monotonic() - began
        if load / cpus < a.load:
            print(f"quiet: load {load:.1f} on {cpus} CPUs after {waited:.0f}s")
            return 0
        if waited >= a.max:
            print(f"quiet: still busy after {waited:.0f}s (load {load:.1f} on {cpus} CPUs); measuring anyway")
            return 0
        time.sleep(min(10, max(a.max - waited, 0.1)))


if __name__ == "__main__":
    raise SystemExit(main())
