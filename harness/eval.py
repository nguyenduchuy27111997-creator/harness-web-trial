#!/usr/bin/env python3
"""A fixed set of past features, built again from the commit each one was first built on, to compare a change to
the agents (a prompt, a model, a new role) with what they did before (DESIGN.md 15.5, P26). Each run builds the
feature with `/next` in a throwaway worktree, never pushes, and records whether the verifier passed it, what it
cost and how long it took. pass^k is the share of features that passed every one of their k runs.

  eval.py pick [--n 10]                 choose the set from merged features (sizes mixed, built on main)
  eval.py run [--k 3] [--model sonnet] [--only F010,F012] [--cap 6]   build each feature k times
  eval.py report                        the runs so far, grouped by kit version and model

The set and the runs live in the loop's home (<git common dir>/harness-loop/eval/). A run costs about what a
feature cost when the loop built it, k times over: check the set and `report` before a full run.
"""
import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backlog  # noqa: E402
from common import CLAUDE, free_port, git, kill_group, stop_processes_in  # noqa: E402

SIZES = ("S", "M", "L")


def home_of(root):
    return Path(git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=root).stdout.strip()) / "harness-loop"


def pick(root, n):
    """Up to n merged features built on main, spread over their sizes, the most recent of each size first."""
    home = home_of(root)
    jobs = json.loads((home / "state.json").read_text())["jobs"]
    sizes = {f["id"]: f.get("complexity", "M") for f in backlog.definitions(root)}
    pool = {s: [] for s in SIZES}
    for j in sorted(jobs.values(), key=lambda j: j.get("merged_at", ""), reverse=True):
        if j.get("stage") != "merged" or not j["id"].startswith("F") or not j.get("base_sha") or j.get("base") != "main":
            continue
        if git("merge-base", "--is-ancestor", j["base_sha"], "origin/main", cwd=root, check=False).returncode:
            continue  # its commit is not on main any more
        size = sizes.get(j["id"], "M")
        pool.setdefault(size, []).append(
            {"id": j["id"], "base_sha": j["base_sha"], "size": size,
             "loop": {"cost": round(j.get("cost", 0), 2), "minutes": round(j.get("lead_seconds", 0) / 60),
                      "first_pass": not j.get("attempts") and not j.get("fix_rounds")}})
    chosen = []
    while len(chosen) < n and any(pool.values()):
        for s in list(pool):
            if pool[s] and len(chosen) < n:
                chosen.append(pool[s].pop(0))
    (home / "eval").mkdir(exist_ok=True)
    (home / "eval/set.json").write_text(json.dumps(chosen, indent=2) + "\n")
    return chosen


def verdict(wt, fid):
    """Passed: the session committed the feature as passing, with the verifier's PASS beside it."""
    status, evidence = wt / f"harness/status/{fid}.json", wt / f"harness/evidence/{fid}.md"
    passing = status.exists() and json.loads(status.read_text()).get("status") == "passing"
    return passing and evidence.exists() and "VERDICT: PASS" in evidence.read_text()


def build(root, item, model, cap, timeout):
    """One run: a detached worktree on the feature's base, `/next <id>`, the result, the worktree gone."""
    wt = Path(tempfile.mkdtemp(prefix=f"eval-{item['id']}-"))
    shutil.rmtree(wt)
    git("worktree", "add", "-q", "--detach", str(wt), item["base_sha"], cwd=root)
    port = free_port(int(os.environ.get("LOOP_EVAL_PORT", "47100")))
    env = {**os.environ, "PORT": str(port), "HARNESS_LANE": f"eval-{item['id']}", "HARNESS_AUTONOMOUS": "1",
           "HARNESS_STAGE": "building"}
    prompt = (f"/next {item['id']}\n\n(This lane's app runs on http://localhost:{port}: PORT is set, and ./init.sh "
              "and the e2e tests use it. Never use port 3000 or another app's port.)")
    cmd = [CLAUDE, "-p", prompt, "--permission-mode", "auto", "--model", model, "--max-budget-usd", str(cap),
           "--output-format", "json", "--setting-sources", "project,local", "--strict-mcp-config",
           "--mcp-config", "harness/loop-mcp.json", "--allowedTools", "mcp__playwright"]
    began = time.time()
    proc = subprocess.Popen(cmd, cwd=wt, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                            start_new_session=True)
    try:
        out, _ = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        kill_group(proc)
        out = ""
    stop_processes_in(str(wt))
    try:
        result = json.loads(out)
    except ValueError:
        result = {}
    row = {"id": item["id"], "size": item["size"], "model": model, "passed": verdict(wt, item["id"]),
           "cost": round(float(result.get("total_cost_usd", 0)), 2), "minutes": round((time.time() - began) / 60, 1),
           "turns": result.get("num_turns"), "timed_out": not out}
    git("worktree", "remove", "--force", str(wt), cwd=root, check=False)
    return row


def summary(runs):
    """pass@1 (share of runs that passed) and pass^k (share of features that passed all their runs), per kit and model."""
    groups = {}
    for r in runs:
        groups.setdefault((r.get("kit", "?"), r["model"]), []).append(r)
    out = []
    for (kit, model), rs in groups.items():
        by = {}
        for r in rs:
            by.setdefault(r["id"], []).append(r["passed"])
        out.append({"kit": kit, "model": model, "runs": len(rs), "features": len(by),
                    "pass_at_1": round(sum(r["passed"] for r in rs) / len(rs), 2),
                    "pass_all": round(sum(all(v) for v in by.values()) / len(by), 2),
                    "k": min(len(v) for v in by.values()),
                    "cost_per_run": round(sum(r["cost"] for r in rs) / len(rs), 2),
                    "minutes_per_run": round(sum(r["minutes"] for r in rs) / len(rs), 1)})
    return out


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("pick")
    sp.add_argument("--n", type=int, default=10)
    sr = sub.add_parser("run")
    sr.add_argument("--k", type=int, default=3)
    sr.add_argument("--model", default="sonnet")
    sr.add_argument("--only", default="")
    sr.add_argument("--cap", type=float, default=6.0, help="dollars at most per run")
    sr.add_argument("--timeout", type=float, default=90 * 60, help="seconds at most per run")
    sub.add_parser("report")
    a = p.parse_args()
    root = Path(git("rev-parse", "--show-toplevel").stdout.strip())
    home = home_of(root)
    if a.cmd == "pick":
        for item in pick(root, a.n):
            print(f"{item['id']}  {item['size']}  base {item['base_sha'][:7]}  loop: ${item['loop']['cost']:.2f}, "
                  f"{item['loop']['minutes']} min, {'first pass' if item['loop']['first_pass'] else 'needed fixes'}")
        return 0
    runs_file = home / "eval/runs.jsonl"
    if a.cmd == "run":
        items = json.loads((home / "eval/set.json").read_text())
        only = {x for x in a.only.split(",") if x}
        manifest = root / "harness/kit-manifest.json"
        kit = json.loads(manifest.read_text()).get("version", "?") if manifest.exists() else "?"
        git("fetch", "-q", "origin", cwd=root, check=False)
        for item in [i for i in items if not only or i["id"] in only]:
            for n in range(1, a.k + 1):
                row = {**build(root, item, a.model, a.cap, a.timeout), "kit": kit, "run": n,
                       "at": datetime.datetime.now().isoformat(timespec="seconds")}
                with runs_file.open("a") as f:
                    f.write(json.dumps(row) + "\n")
                print(f"{row['id']} run {n}/{a.k}: {'PASS' if row['passed'] else 'FAIL'}, ${row['cost']:.2f}, "
                      f"{row['minutes']} min", flush=True)
    runs = [json.loads(x) for x in runs_file.read_text().splitlines() if x.strip()] if runs_file.exists() else []
    for s in summary(runs):
        print(f"kit {s['kit']}, {s['model']}: {s['features']} features x{s['k']}, pass@1 {s['pass_at_1']:.0%}, "
              f"pass^{s['k']} {s['pass_all']:.0%}, ${s['cost_per_run']:.2f} and {s['minutes_per_run']} min a run")
    if not runs:
        print("No eval runs yet: eval.py pick, then eval.py run.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
