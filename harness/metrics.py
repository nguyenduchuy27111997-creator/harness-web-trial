#!/usr/bin/env python3
"""Scorecard of the build loop: how often a feature passes the first time, what features cost and where the
cost goes, how long a feature takes and where that time goes, what each role caught, how often the human stepped
in, and whether failures were the code's or the machine's. The baseline the agent-team plan is measured against
(DESIGN.md 15.5, P26).

  metrics.py [--json] [HOME ...]    HOME is a <git common dir>/harness-loop folder (default: this project's);
                                    several are added up (one per project)
"""
import argparse
import collections
import datetime
import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

import history

FEATURE = re.compile(r"^[FB]\d+$")  # features and bugs; not designs (D-), rules (L-) or reverts (R-)
# Failure kinds that are the machine, the network or the account, not the code (DESIGN.md section 12).
INFRA = re.compile(r"no result|ran over|time limit|network|usage limit|api|runner|offline|timed out|could not reach"
                   r"|not start|cancel", re.I)
REVIEW_TARGET = 0.30  # review dollars per feature the design aims for
AGENT_STAGES = ("building", "review", "fixing")  # the stages a Claude session runs in


def rows(path):
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()] if path.exists() else []


def model_costs(home, jobs):
    """Dollars by model: from each session's own record when it has one (kit 5.0+), else from its log."""
    out = {}
    logs = sorted((home / "sessions").glob("*.log")) if (home / "sessions").exists() else []
    for log in logs:
        for chunk in log.read_text(errors="replace").split("--- stdout\n")[1:]:
            try:
                result = json.loads(chunk.split("\n--- stderr")[0])
            except ValueError:
                continue
            for model, usage in (result.get("modelUsage") or {}).items():
                out[model] = out.get(model, 0) + usage.get("costUSD", 0)
    if not out:
        for j in jobs:
            for s in j.get("sessions", []):
                for model, cost in (s.get("by_model") or {s.get("model") or "?": s.get("cost", 0)}).items():
                    out[model] = out.get(model, 0) + cost
    return out


def quantile(values, q):
    if not values:
        return 0.0
    values = sorted(values)
    return values[min(len(values) - 1, int(q * (len(values) - 1) + 0.5))]


def stage_minutes(home, ids):
    """Minutes each merged feature in ids spent in each stage, from events.log: from one stage line of the job to
    its next, up to `merged`. A stage's time includes waiting for a lane or for the machine."""
    marks = collections.defaultdict(list)
    for e in history.log_events(home):
        if e["kind"] == "stage" and e["job"] in ids:
            marks[e["job"]].append((datetime.datetime.fromisoformat(e["at"]), e["stage"]))
    out = {}
    for fid, ms in marks.items():
        if ms[-1][1] != "merged":
            continue
        mins = collections.Counter()
        for (at, stage), (nxt, _) in zip(ms, ms[1:]):
            mins[stage] += (nxt - at).total_seconds() / 60
        out[fid] = mins
    return out


def lead(flows, agent):
    """Lead time (first build to merge) and where it goes, in minutes, from each merged feature's stage minutes;
    agent is each one's minutes in Claude sessions, the part the agents themselves work."""
    if not flows:
        return None
    totals = [sum(m.values()) for m in flows]
    spent = collections.Counter()
    for m in flows:
        spent.update(m)
    return {"features": len(flows), "p50": round(quantile(totals, 0.5)), "p90": round(quantile(totals, 0.9)),
            "agent_p50": round(quantile(agent, 0.5)),
            "share": {k: round(v / sum(totals), 2) for k, v in spent.most_common() if v / sum(totals) >= 0.005},
            "stage_p50": {k: round(quantile([m.get(k, 0) for m in flows], 0.5)) for k in spent}}


def roles(features, failures):
    """Per role: its sessions, dollars and minutes, and what it caught or let through."""
    out = {}
    for stage in AGENT_STAGES:
        ss = [s for j in features for s in j.get("sessions", []) if s.get("stage") == stage]
        out[stage] = {"sessions": len(ss), "cost": round(sum(s.get("cost", 0) for s in ss), 2),
                      "minutes_p50": round(quantile([s.get("seconds", 0) / 60 for s in ss], 0.5))}
    kinds = collections.Counter(f.get("kind", "") for f in failures)
    out["caught"] = {
        "review_code": kinds["review bug: code"], "review_ui": kinds["review bug: ui (designer)"],
        "review_design": kinds["review bug: design doc"],
        # a PR reaches CI only with the verifier's PASS and a review with no [bug]: what both let through
        "ci_red_after_checks": kinds["ci failed on the pr"], "main_red": kinds["main ci failed after merge"],
        "conflicts": sum(n for k, n in kinds.items() if k.startswith("conflict")),
        # review findings no fix was paid for (kit 5.23+): refuted by the skeptic, or rejected by the author with a reason
        "dropped_by_skeptic": sum(j.get("skeptic_dropped", 0) for j in features),
        "rejected_by_author": sum(j.get("triage", {}).get("rejected", 0) for j in features)}
    return out


def card(homes):
    jobs, runs_log, failures, models, flows, agent = [], [], [], {}, [], []
    for home in map(Path, homes):
        state = json.loads((home / "state.json").read_text()) if (home / "state.json").exists() else {}
        mine = list(state.get("jobs", {}).values())
        jobs += mine
        runs_log += rows(home / "history.jsonl")
        failures += rows(home / "failures.jsonl")
        for model, cost in model_costs(home, mine).items():
            models[model] = models.get(model, 0) + cost
        merged = {j["id"]: j for j in mine if FEATURE.match(j["id"]) and j.get("stage") == "merged"}
        for fid, mins in stage_minutes(home, merged).items():
            flows.append(mins)
            agent.append(sum(s.get("seconds", 0) for s in merged[fid].get("sessions", [])) / 60)
    features = [j for j in jobs if FEATURE.match(j["id"]) and j.get("stage") == "merged"]
    first = [j for j in features if not j.get("attempts") and not j.get("fix_rounds")]
    costs = [j.get("cost", 0) for j in features]
    review = sum(s.get("cost", 0) for j in features for s in j.get("sessions", []) if s.get("stage") == "review")
    infra = [f for f in failures if INFRA.search(f.get("kind", ""))]
    total_models = sum(models.values()) or 1
    runs = {}
    for r in runs_log:
        p = r.get("provenance") or {}
        key = f"kit {p.get('kit') or '?'}, Claude Code {p.get('claude') or '?'}"
        group = runs.setdefault(key, {"runs": 0, "merged": 0, "spent": 0.0})
        group["runs"] += 1
        group["merged"] += len(r.get("merged", []))
        group["spent"] = round(group["spent"] + r.get("spent", 0), 2)
    return {
        "features": len(features),
        "first_pass": len(first), "first_pass_yield": round(len(first) / len(features), 2) if features else None,
        "fix_rounds": sum(j.get("fix_rounds", 0) for j in features), "retries": sum(j.get("attempts", 0) for j in features),
        "cost_mean": round(statistics.mean(costs), 2) if costs else 0.0,
        "cost_p50": round(quantile(costs, 0.5), 2), "cost_p90": round(quantile(costs, 0.9), 2),
        "review_per_feature": round(review / len(features), 2) if features else 0.0, "review_target": REVIEW_TARGET,
        "human_answers": sum(len(j.get("answers", [])) for j in jobs),
        "reverts": sum(1 for j in jobs if j["id"].startswith("R-")),
        "failures": len(failures), "infra_failures": len(infra),
        "model_share": {m: round(c / total_models, 2) for m, c in sorted(models.items(), key=lambda kv: -kv[1])},
        "by_provenance": runs,
        "lead": lead(flows, agent),
        "roles": roles(features, failures),
    }


def text(c):
    if not c["features"]:
        return "No merged features yet."
    lines = [
        f"First pass: {c['first_pass']}/{c['features']} features ({c['first_pass_yield']:.0%}) merged with no retry and no fix "
        f"round; {c['retries']} retries and {c['fix_rounds']} fix rounds in all.",
        f"Cost per feature: mean ${c['cost_mean']:.2f}, median ${c['cost_p50']:.2f}, p90 ${c['cost_p90']:.2f}; review "
        f"${c['review_per_feature']:.2f} per feature (aim ${c['review_target']:.2f}).",
        f"The human answered {c['human_answers']} time(s); {c['reverts']} revert(s); {c['failures']} failures, "
        f"{c['infra_failures']} of them the machine or the network.",
    ]
    if c["lead"]:
        lt = c["lead"]
        hours = lambda m: f"{m // 60} h {m % 60:02d} min" if m >= 60 else f"{m} min"  # noqa: E731
        lines.append(f"Lead time, first build to merge: median {hours(lt['p50'])}, p90 {hours(lt['p90'])} "
                     f"({lt['features']} features); the agents worked a median of {hours(lt['agent_p50'])} of it.")
        lines.append("Where it goes: " + ", ".join(f"{k} {v:.0%}" for k, v in lt["share"].items() if v >= 0.03) + ".")
    r = c["roles"]
    lines.append("Sessions: " + ", ".join(f"{k} {r[k]['sessions']} (${r[k]['cost']:.2f}, median {r[k]['minutes_p50']} min)"
                                          for k in AGENT_STAGES) + ".")
    k = r["caught"]
    lines.append(f"Caught by review: {k['review_code']} code, {k['review_ui']} UI, {k['review_design']} design doc; "
                 f"let through to CI by the verifier and review: {k['ci_red_after_checks']}; main red after a merge: "
                 f"{k['main_red']}; conflicts: {k['conflicts']}; findings refuted by the skeptic: "
                 f"{k['dropped_by_skeptic']}, rejected by the author: {k['rejected_by_author']}.")
    if c["model_share"]:
        lines.append("Spend by model: " + ", ".join(f"{m} {s:.0%}" for m, s in c["model_share"].items()) + ".")
    for key, g in c["by_provenance"].items():
        lines.append(f"{key}: {g['runs']} run(s), {g['merged']} merged, ${g['spent']:.2f}.")
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--json", action="store_true")
    p.add_argument("homes", nargs="*")
    a = p.parse_args()
    homes = a.homes or [subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                                       capture_output=True, text=True).stdout.strip() + "/harness-loop"]
    c = card(homes)
    print(json.dumps(c, indent=2) if a.json else text(c))
    return 0


if __name__ == "__main__":
    sys.exit(main())
