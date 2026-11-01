#!/usr/bin/env python3
"""Scorecard of the build loop: how often a feature passes the first time, what features cost and where the
cost goes, how often the human stepped in, and whether failures were the code's or the machine's.

  metrics.py [--json] [HOME ...]    HOME is a <git common dir>/harness-loop folder (default: this project's);
                                    several are added up (one per project)
"""
import argparse
import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

FEATURE = re.compile(r"^[FB]\d+$")  # features and bugs; not designs (D-), rules (L-) or reverts (R-)
# Failure kinds that are the machine, the network or the account, not the code (DESIGN.md section 12).
INFRA = re.compile(r"no result|ran over|time limit|network|usage limit|api|runner|offline|timed out|could not reach"
                   r"|not start|cancel", re.I)
REVIEW_TARGET = 0.30  # review dollars per feature the design aims for


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


def card(homes):
    jobs, history, failures, models = [], [], [], {}
    for home in map(Path, homes):
        state = json.loads((home / "state.json").read_text()) if (home / "state.json").exists() else {}
        mine = list(state.get("jobs", {}).values())
        jobs += mine
        history += rows(home / "history.jsonl")
        failures += rows(home / "failures.jsonl")
        for model, cost in model_costs(home, mine).items():
            models[model] = models.get(model, 0) + cost
    features = [j for j in jobs if FEATURE.match(j["id"]) and j.get("stage") == "merged"]
    first = [j for j in features if not j.get("attempts") and not j.get("fix_rounds")]
    costs = [j.get("cost", 0) for j in features]
    review = sum(s.get("cost", 0) for j in features for s in j.get("sessions", []) if s.get("stage") == "review")
    infra = [f for f in failures if INFRA.search(f.get("kind", ""))]
    total_models = sum(models.values()) or 1
    runs = {}
    for r in history:
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
