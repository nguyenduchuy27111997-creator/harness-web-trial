#!/usr/bin/env python3
"""A fixed set of past features, built again from the commit each one was first built on, to compare a change to
the agents (a prompt, a model, a new role) with what they did before (DESIGN.md 15.5, P26). Each run builds the
feature with `/next` in a throwaway worktree, never pushes, and records whether the verifier passed it, what it
cost and how long it took. pass^k is the share of features that passed every one of their k runs.

  eval.py pick [--n 10]                 choose the set from merged features (sizes mixed, built on main)
  eval.py run [--k 3] [--model sonnet] [--only F010,F012] [--cap 6] [--kit ~/harness-kit-5.53]
                                        build each feature k times (with --kit: that kit checkout's agents and loop
                                        files laid over the feature's base, so two kit versions run the same work)
  eval.py report                        the runs so far, grouped by kit version and model
  eval.py compare <kit A> <kit B> [--model sonnet]   the two side by side on the features both ran, per feature,
                                        with a paired bootstrap interval for the difference in pass rate
  eval.py agents harvest                cases for single agents from what the loop kept (the CI doctor's input and
                                        what the fix changed; the dispatcher's brief and what the owner did), plus
                                        the project's own cases in harness/eval-cases/*.json
  eval.py agents run [--agent dispatcher] [--kit DIR] [--k 1]   each case again on its commit, graded
  eval.py agents report | agents compare <kit A> <kit B> [--agent ci-doctor]

The set and the runs live in the loop's home (<git common dir>/harness-loop/eval/). A run costs about what a
feature cost when the loop built it, k times over: check the set and `report` before a full run.
"""
import argparse
import datetime
import json
import os
import random
import re
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


def criteria(wt, fid):
    """[passed, total] acceptance criteria in the verifier's evidence: partial credit beside the verdict."""
    evidence = wt / f"harness/evidence/{fid}.md"
    found = re.findall(r"CRITERION\s+\d+\s*:\s*(PASS|FAIL)", evidence.read_text()) if evidence.exists() else []
    return [found.count("PASS"), len(found)]


def kit_version(wt):
    manifest = wt / "harness/kit-manifest.json"
    return json.loads(manifest.read_text()).get("version", "?") if manifest.exists() else "?"


def build(root, item, model, cap, timeout, kit=None):
    """One run: a detached worktree on the feature's base (with kit: that kit checkout's files laid over it),
    `/next <id>`, the result, the worktree gone."""
    wt = Path(tempfile.mkdtemp(prefix=f"eval-{item['id']}-"))
    shutil.rmtree(wt)
    git("worktree", "add", "-q", "--detach", str(wt), item["base_sha"], cwd=root)
    if kit:  # the agents, skills and loop files of the kit under test, not the ones the project had then
        subprocess.run([str(Path(kit) / "install.sh"), "--upgrade", str(wt)], cwd=wt, capture_output=True, text=True)
    version = kit_version(wt)
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
    row = {"id": item["id"], "size": item["size"], "model": model, "kit": version, "passed": verdict(wt, item["id"]),
           "criteria": criteria(wt, item["id"]),
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


def compare(runs, a, b, model=None, draws=2000):
    """Kit a against kit b on the features both ran: per feature the pass rate, cost and minutes of each, and a
    paired bootstrap interval (90%) for b's pass rate minus a's. Features are the unit: each draw resamples them."""
    pick = lambda kit: [r for r in runs if r.get("kit") == kit and (not model or r["model"] == model)]  # noqa: E731
    by = {}
    for side, kit in (("a", a), ("b", b)):
        for r in pick(kit):
            by.setdefault(r["id"], {"a": [], "b": []})[side].append(r)
    both = {f: v for f, v in by.items() if v["a"] and v["b"]}
    mean = lambda xs: sum(xs) / len(xs) if xs else 0.0  # noqa: E731
    rows = [{"id": f, **{f"{s}_{k}": round(mean([float(r[k]) for r in v[s]]), 2)
                         for s in "ab" for k in ("passed", "cost", "minutes")},
             "a_runs": len(v["a"]), "b_runs": len(v["b"])} for f, v in sorted(both.items())]
    if not rows:
        return {"features": 0, "rows": [], "verdict": f"no feature ran on both {a} and {b}"}
    diffs = [r["b_passed"] - r["a_passed"] for r in rows]
    rng = random.Random(0)
    boot = sorted(mean([rng.choice(diffs) for _ in diffs]) for _ in range(draws))
    lo, hi = boot[int(0.05 * draws)], boot[int(0.95 * draws) - 1]
    verdict_ = (f"{b} passes more" if lo > 0 else f"{b} passes less" if hi < 0 else "no clear difference in pass rate")
    return {"features": len(rows), "rows": rows, "pass_diff": round(mean(diffs), 2), "interval": [round(lo, 2), round(hi, 2)],
            "cost_diff": round(mean([r["b_cost"] - r["a_cost"] for r in rows]), 2),
            "minutes_diff": round(mean([r["b_minutes"] - r["a_minutes"] for r in rows]), 1), "verdict": verdict_}


DISPATCH_ACTION = re.compile(r'"action"\s*:\s*"(\w+)"')
ACCEPTED = re.compile(r"^The owner accepted the dispatcher's suggestion \((\w+)\)")


def agreed(reply, answer):
    """True when the owner's answer takes the dispatcher's own advice: one of its options or its detail, as the
    dashboard's picker and an approval pass it on. Seen on the web trial: F092's ask_owner was right (the owner
    approved its detail) and F090's owner picked its first option, and both were graded wrong."""
    if re.match(r"^The owner (chose|approves|approved|accepted)\b", answer):
        return True
    try:
        advice = json.loads(re.findall(r"\{.*\}", reply, re.S)[-1])
    except (IndexError, ValueError):
        return False
    texts = [advice.get("detail") or ""] + [o.get("answer") or "" for o in advice.get("options") or [] if isinstance(o, dict)]
    return any(len(t) >= 40 and t[:80] in answer for t in texts)


def harvest(root, home):
    """Cases with what a good reply says, from the loop's kept inputs once their outcome is known, and the
    project's hand-written ones (harness/eval-cases/*.json: [{"id", "agent", "sha", "prompt", "expect"}])."""
    rows = [json.loads(x) for x in (home / "eval/agent-inputs.jsonl").read_text().splitlines() if x.strip()] \
        if (home / "eval/agent-inputs.jsonl").exists() else []
    inputs = {r["case"]: r for r in rows if "prompt" in r}
    cases = []
    for r in rows:
        if "outcome" not in r or r["case"] not in inputs:
            continue
        i, o = inputs[r["case"]], r["outcome"]
        if i["agent"] == "ci-doctor":
            expect = {"where_in": o["fixed_files"]} if o.get("fixed_files") else {"verdict": "FLAKE"}
        elif i["agent"] == "dispatcher":
            answer = o.get("answer") or ""
            accepted = ACCEPTED.match(answer)
            if accepted:
                expect = {"action": accepted.group(1)}
            elif o.get("stage") == "dropped":
                expect = {"action": "drop"}
            elif agreed(i.get("reply") or "", answer):  # the owner picked its option or approved what it asked
                expect = {"action": (DISPATCH_ACTION.findall(i["reply"]) or ["?"])[-1]}
            elif answer:
                expect = {"not_action": ["drop", "ask_owner"]}
            else:
                continue
        else:
            continue
        cases.append({"id": i["case"], "agent": i["agent"], "sha": i["sha"], "prompt": i["prompt"], "expect": expect})
    for f in sorted((root / "harness/eval-cases").glob("*.json")) if (root / "harness/eval-cases").is_dir() else []:
        cases += [c for c in json.loads(f.read_text()) if {"id", "agent", "prompt", "expect"} <= set(c)]
    (home / "eval").mkdir(exist_ok=True)
    (home / "eval/agent-cases.json").write_text(json.dumps(cases, indent=1) + "\n")
    return cases


def grade(reply, expect):
    """True when the reply says what the case expects; each key of expect is one test, all must hold."""
    ok = True
    if "where_in" in expect:
        m = re.search(r"WHERE:\s*`?([^\s:`]+)", reply)
        ok &= bool(m) and any(m.group(1).endswith(f) or f.endswith(m.group(1)) for f in expect["where_in"])
    if "verdict" in expect:
        ok &= re.search(rf"^\W*{expect['verdict']}:", reply, re.M) is not None
    action = (DISPATCH_ACTION.findall(reply) or [None])[-1]
    if "action" in expect:
        ok &= action == expect["action"]
    if "not_action" in expect:
        ok &= action is not None and action not in expect["not_action"]
    for rx in expect.get("contains", []):
        ok &= re.search(rx, reply, re.I | re.M) is not None
    for rx in expect.get("not_contains", []):
        ok &= re.search(rx, reply, re.I | re.M) is None
    return bool(ok)


def run_case(root, case, kit=None, cap=0.5, timeout=20 * 60):
    """One case: a detached worktree on its commit (with kit: that kit's agents), the agent asked, the reply graded."""
    wt = Path(tempfile.mkdtemp(prefix=f"eval-{case['agent']}-"))
    shutil.rmtree(wt)
    sha = case.get("sha") if case.get("sha") and git("cat-file", "-e", f"{case.get('sha')}^{{commit}}", cwd=root,
                                                       check=False).returncode == 0 else "HEAD"
    git("worktree", "add", "-q", "--detach", str(wt), sha, cwd=root)
    if kit:
        subprocess.run([str(Path(kit) / "install.sh"), "--upgrade", str(wt)], cwd=wt, capture_output=True, text=True)
    version = kit_version(wt)
    cmd = [CLAUDE, "-p", case["prompt"], "--agent", case["agent"], "--permission-mode", "auto", "--max-budget-usd",
           str(cap), "--output-format", "json", "--setting-sources", "project", "--strict-mcp-config"]
    began = time.time()
    proc = subprocess.Popen(cmd, cwd=wt, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        out, _ = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        kill_group(proc)
        out = ""
    git("worktree", "remove", "--force", str(wt), cwd=root, check=False)
    try:
        result = json.loads(out)
    except ValueError:
        result = {}
    reply = result.get("result") or ""
    return {"id": case["id"], "agent": case["agent"], "model": case["agent"], "kit": version,
            "passed": grade(reply, case["expect"]), "cost": round(float(result.get("total_cost_usd", 0)), 2),
            "minutes": round((time.time() - began) / 60, 1), "reply": reply[:600]}


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
    sr.add_argument("--kit", help="a harness-kit checkout whose files the runs use (default: the feature's own)")
    sub.add_parser("report")
    sa = sub.add_parser("agents")
    sa.add_argument("what", choices=["harvest", "run", "report", "compare"])
    sa.add_argument("kits", nargs="*")
    sa.add_argument("--agent")
    sa.add_argument("--kit")
    sa.add_argument("--k", type=int, default=1)
    sc = sub.add_parser("compare")
    sc.add_argument("a")
    sc.add_argument("b")
    sc.add_argument("--model")
    a = p.parse_args()
    root = Path(git("rev-parse", "--show-toplevel").stdout.strip())
    home = home_of(root)
    if a.cmd == "pick":
        for item in pick(root, a.n):
            print(f"{item['id']}  {item['size']}  base {item['base_sha'][:7]}  loop: ${item['loop']['cost']:.2f}, "
                  f"{item['loop']['minutes']} min, {'first pass' if item['loop']['first_pass'] else 'needed fixes'}")
        return 0
    if a.cmd == "agents":
        return agents(root, home, a)
    runs_file = home / "eval/runs.jsonl"
    if a.cmd == "run":
        items = json.loads((home / "eval/set.json").read_text())
        only = {x for x in a.only.split(",") if x}
        git("fetch", "-q", "origin", cwd=root, check=False)
        for item in [i for i in items if not only or i["id"] in only]:
            for n in range(1, a.k + 1):
                row = {**build(root, item, a.model, a.cap, a.timeout, a.kit), "run": n,
                       "at": datetime.datetime.now().isoformat(timespec="seconds")}
                with runs_file.open("a") as f:
                    f.write(json.dumps(row) + "\n")
                print(f"{row['id']} run {n}/{a.k}: {'PASS' if row['passed'] else 'FAIL'}, ${row['cost']:.2f}, "
                      f"{row['minutes']} min", flush=True)
    runs = [json.loads(x) for x in runs_file.read_text().splitlines() if x.strip()] if runs_file.exists() else []
    if a.cmd == "compare":
        c = compare(runs, a.a, a.b, a.model)
        for r in c["rows"]:
            print(f"{r['id']}: pass {r['a_passed']:.0%} -> {r['b_passed']:.0%}, ${r['a_cost']:.2f} -> ${r['b_cost']:.2f}, "
                  f"{r['a_minutes']} -> {r['b_minutes']} min ({r['a_runs']} and {r['b_runs']} runs)")
        if c["features"]:
            print(f"{c['features']} features: pass rate {c['pass_diff']:+.0%} (90% interval {c['interval'][0]:+.0%} to "
                  f"{c['interval'][1]:+.0%}), cost {c['cost_diff']:+.2f} $, {c['minutes_diff']:+} min a run: {c['verdict']}")
        else:
            print(c["verdict"])
        return 0
    for s in summary(runs):
        print(f"kit {s['kit']}, {s['model']}: {s['features']} features x{s['k']}, pass@1 {s['pass_at_1']:.0%}, "
              f"pass^{s['k']} {s['pass_all']:.0%}, ${s['cost_per_run']:.2f} and {s['minutes_per_run']} min a run")
    if not runs:
        print("No eval runs yet: eval.py pick, then eval.py run.")
    return 0


def agents(root, home, a):
    runs_file = home / "eval/agent-runs.jsonl"
    if a.what == "harvest":
        cases = harvest(root, home)
        by = {}
        for c in cases:
            by[c["agent"]] = by.get(c["agent"], 0) + 1
        print(", ".join(f"{k}: {v} case(s)" for k, v in sorted(by.items())) or
              "No cases yet: the loop keeps the CI doctor's and the dispatcher's inputs as they happen.")
        return 0
    if a.what == "run":
        cases = json.loads((home / "eval/agent-cases.json").read_text()) if (home / "eval/agent-cases.json").exists() else []
        for case in [c for c in cases if not a.agent or c["agent"] == a.agent]:
            for n in range(1, a.k + 1):
                row = {**run_case(root, case, a.kit), "run": n, "at": datetime.datetime.now().isoformat(timespec="seconds")}
                with runs_file.open("a") as f:
                    f.write(json.dumps(row) + "\n")
                print(f"{row['id']} run {n}: {'PASS' if row['passed'] else 'FAIL'}, ${row['cost']:.2f}", flush=True)
    runs = [json.loads(x) for x in runs_file.read_text().splitlines() if x.strip()] if runs_file.exists() else []
    if a.what == "compare":
        if len(a.kits) != 2:
            print("agents compare <kit A> <kit B> [--agent X]")
            return 2
        c = compare(runs, a.kits[0], a.kits[1], a.agent)
        print(f"{c['features']} cases: {c['verdict']}" + (f" (pass rate {c['pass_diff']:+.0%}, 90% interval "
              f"{c['interval'][0]:+.0%} to {c['interval'][1]:+.0%}; cost {c['cost_diff']:+.2f} $)" if c["features"] else ""))
        return 0
    for s in summary([r for r in runs if not a.agent or r["agent"] == a.agent]):
        print(f"kit {s['kit']}, {s['model']}: {s['features']} cases x{s['k']}, pass@1 {s['pass_at_1']:.0%}, "
              f"${s['cost_per_run']:.2f} a run")
    if not runs:
        print("No agent eval runs yet: eval.py agents harvest, then eval.py agents run.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
