"""Claude sessions: when one may start (load, budgets, caps), which model, its settings, and running it. A mixin of loop.Loop."""

import datetime
import json
import os
import re
import shutil
import subprocess
import threading
import time

from common import (  # noqa: F401
    api_reachable, final_result, free_port, git, health, kill_group, lang, limit_resume, metrics, now, online,
    preview, run, stop_processes_in, stream, API_DOWN, AUTH, AUTH_PAUSE, CLAUDE, ENV_KEEP, FEATURE_FLOOR, FEATURE_ID, FIX_SONNET,
    INFRA_PAUSE, LIMIT, MAX_LOAD, MIN_DISK_GB, MIN_SESSION, OFFLINE_MAX, PORT_LOCK, PRIOR_COST, PROBE_EVERY,
    PROBE_MAX, Path, SANDBOX, SESSION_TIMEOUT, STAGE_CAPS, STREAM, DAILY_BUDGET, DAY_SHED, MIN_LANES,
)


class Agents:
    def free_budget(self):
        """What the run may still spend: the budget less what is spent and what running sessions may spend."""
        return self.state["budget"] - self.state["spent"] - sum(self.caps.values())

    def can_start(self):
        """Enough budget left to start a Claude session worth having, on a machine that can take it, within the day's cap."""
        return self.free_budget() >= MIN_SESSION and not self.busy and not self.day_full()

    def spent_today(self):
        """Dollars spent today, by every run (each session's cost, by the day it ended), and held by running sessions."""
        today = now()[:10]
        done = sum(s.get("cost", 0) for j in self.state["jobs"].values() for s in j.get("sessions", [])
                   if str(s.get("ended", "")).startswith(today))
        return done + sum(self.caps.values())

    def day_share(self):
        return self.spent_today() / DAILY_BUDGET if DAILY_BUDGET > 0 else 0.0

    def day_full(self):
        """The daily cap is reached: no new session until tomorrow; CI and merges go on (DESIGN.md 15.5, P29)."""
        full = self.day_share() >= 1.0
        day = now()[:10]
        if full and self.state.get("day_full") != day:
            self.state["day_full"] = day
            self.event("loop", f"daily cap: ${self.spent_today():.2f} of ${DAILY_BUDGET:.0f} spent today; no new "
                               "session until tomorrow (CI and merges go on)")
            self.push(f"daycap:{day}", lang.say("Daily cap reached"),
                      lang.say("${spent} of ${cap} spent today; new sessions wait for tomorrow.",
                               spent=f"{self.spent_today():.2f}", cap=f"{DAILY_BUDGET:.0f}"))
        return full

    def lane_limit(self):
        """Lanes for new work now: --lanes on a quiet machine, fewer as the load or memory rise or as the day's
        spend nears its cap, never under LOOP_MIN_LANES (or --lanes, if that is lower)."""
        top = self.opts.lanes
        low = min(MIN_LANES, top)
        h = getattr(self, "health_now", None) or {}
        per = h["load"] / h["cpus"] if h.get("load") is not None and h.get("cpus") else 0.0
        if per >= 1.0 or h.get("memory") not in (None, "normal") or self.day_share() >= DAY_SHED[0]:
            n = low
        elif per >= 0.6:
            n = (low + top + 1) // 2
        else:
            n = top
        if n != self.state.get("lane_limit"):
            if self.state.get("lane_limit") is not None:
                self.event("loop", f"lanes: {n} of {top} (load {per:.1f} per CPU, memory {h.get('memory') or '?'}, "
                                   f"{self.day_share():.0%} of the daily cap)")
            self.state["lane_limit"] = n
        return n

    def machine_busy(self):
        """Why no new session should start (load, critical memory, disk, a failing probe), else None."""
        h = self.health_now = health.snapshot(self.state, self.root)
        if h["load"] is not None and h["cpus"] and h["load"] / h["cpus"] > MAX_LOAD:
            return f"load {h['load']} on {h['cpus']} CPUs"
        if h["memory"] == "critical":
            return "memory pressure is critical"
        if h["disk_free_gb"] < MIN_DISK_GB:
            return f"only {h['disk_free_gb']} GB of disk free"
        if time.time() - self.state.get("probed", 0) >= PROBE_EVERY:
            self.state["probed"] = time.time()
            failed = None
            for cmd in self.stack.get("probes", []):
                try:
                    ok = run(cmd, cwd=self.root, timeout=20).returncode == 0
                except (RuntimeError, OSError):
                    ok = False
                if not ok:
                    failed = " ".join(cmd)
                    break
            self.state["probe_failing"] = failed
            if failed:
                self.state.setdefault("probe_since", time.time())
            else:
                self.state.pop("probe_since", None)
        if self.state.get("probe_failing"):
            down = time.time() - self.state["probe_since"]
            if down > PROBE_MAX:
                self.state["stop_now"] = True
                self.state["stop_reason"] = f"`{self.state['probe_failing']}` has failed for {down / 60:.0f} min"
            return f"`{self.state['probe_failing']}` fails (is it running?)"
        return None

    def low_budget(self):
        return self.state["budget"] - self.state["spent"] < MIN_SESSION

    def full_cap(self, stage):
        return min(self.opts.session_budget, STAGE_CAPS.get(stage, self.opts.session_budget))

    def starved(self, job, res):
        """The session was cut off by a cap the run's dwindling budget set, not by the work itself."""
        return (res.get("subtype") == "error_max_budget_usd"
                and job.get("last_cap", 0) < self.full_cap(job.get("cap_stage", "building")) - 0.005)

    def recent_costs(self):
        done = sorted((j for j in self.state["jobs"].values() if FEATURE_ID.match(j["id"]) and j["stage"] == "merged"),
                      key=lambda j: j.get("merged_at", ""))[-30:]
        return [j.get("cost", 0) for j in done]

    def typical_cost(self):
        costs = self.recent_costs()
        if len(costs) < 5:
            return PRIOR_COST.get(self.stack.get("kind"), 2.5)
        return metrics.quantile(costs, 0.5)

    def feature_budget(self, job):
        return max(FEATURE_FLOOR, 3 * self.typical_cost()) + job.get("budget_extra", 0)

    def over_feature_budget(self, job):
        """A feature that spent more than its share stops and asks before it spends more (real trial: $15 on one)."""
        if not FEATURE_ID.match(job["id"]) or job.get("cost", 0) < self.feature_budget(job):
            return False
        job["budget_held"] = job["stage"]
        self.set_stage(job, "held", note=f"spent ${job['cost']:.2f}, over its budget of ${self.feature_budget(job):.2f}",
                       question=f"{job['id']} has spent ${job['cost']:.2f}, more than its budget (${self.feature_budget(job):.2f}: "
                                "three times what a feature here usually costs). Answer \"$5 more\" (or any amount) to go "
                                "on, or drop it.")
        return True

    def launch(self, job, work):
        if self.over_feature_budget(job):
            return
        holder = {}
        # Each lane gets its own share, so lanes together stay within the budget (a session ending at
        # once with nothing left is still capped at a cent, as before).
        self.caps[job["id"]] = round(min(self.full_cap(job["stage"]), max(self.free_budget(), 0.01)), 2)
        job["last_cap"], job["cap_stage"] = self.caps[job["id"]], job["stage"]

        def target():
            began = time.time()
            try:
                holder["result"] = work(job)
            except Exception as e:  # a crashed lane must not take the loop down
                holder["result"] = {"error": str(e)}
            holder["seconds"] = round(time.time() - began)
        t = threading.Thread(target=target, daemon=True)
        self.threads[job["id"]] = (t, holder, job["stage"])  # the result is for this stage, whatever happens meanwhile
        t.start()

    def claude(self, job, prompt, model, turns=200, lane_note=True, agent=None, cap=None, solo=False, effort=None):
        """One headless Claude run in the job's worktree. Returns (cost, subtype, text). With `agent`, that
        subagent runs as the session itself (`--agent`, no relay session): read-only lenses without a browser,
        several at once for one job; `solo`, an agent that works in the worktree alone, as a build does (the merger)."""
        lens = agent and not solo
        cap = cap or self.caps[job["id"]]
        with PORT_LOCK:
            held = self.__dict__.setdefault("held_ports", set())  # sessions that are no job's own (a best-of-2 twin)
            port = free_port(self.opts.port_base + 1, taken={j.get("port") for j in self.state["jobs"].values()} | held)
            held.add(port)
            if not lens:  # a lens beside the job's own session (a test-writer beside the coder) leaves it the port
                job["port"] = port
        env = {**os.environ, "PORT": str(port), "HARNESS_LANE": job["id"], "HARNESS_AUTONOMOUS": "1",
               "HARNESS_STAGE": job["stage"],
               "HARNESS_TESTS": str(preview.PREVIEW.tests_path(job["id"])),  # the kit's reporters write each test here
               "HARNESS_QUALITY": str(self.quality_path(job["id"], fresh=True))}  # and check.sh its numbers (quality.py)
        # check.sh runs only this feature's e2e specs (Next.js preset, scripts/e2e.sh); CI runs the whole suite
        # before merge. HARNESS_E2E=all in the loop's own environment keeps the whole suite in every session.
        env.setdefault("HARNESS_E2E", "feature")
        env["HARNESS_FEATURE"] = job["id"]
        if lens:  # it commits nothing (a lens, the dispatcher; the test-writer leaves its file to the coder), so the stop gate lets it end
            env["HARNESS_READONLY"] = "1"
        if lane_note:
            prompt += (f"\n\n(This lane's app runs on http://localhost:{port}: PORT is set, and ./init.sh and the "
                       "e2e tests use it. Never use port 3000 or another app's port.)")
        job["last_model"] = model
        cmd = (["nice", "-n", "10"] if shutil.which("nice") else []) + [CLAUDE, "-p", prompt, "--permission-mode", "auto", "--model", model, "--max-budget-usd", str(cap),
               "--max-turns", str(turns), "--output-format", "stream-json" if STREAM else "json", "--setting-sources",
               "project" if SANDBOX else "project,local", "--strict-mcp-config",
               "--exclude-dynamic-system-prompt-sections"]  # the same system prompt in every lane: cache hits
        if agent:
            cmd += ["--agent", agent] + self.agent_def(job, agent)
        if effort:
            cmd += ["--effort", effort]
        browser = not lens and self.stack.get("verify", "browser") == "browser"  # an API is verified with curl: no browser
        if SANDBOX:
            env = {k: v for k, v in env.items() if ENV_KEEP.match(k) or k in self.stack.get("env_allow", [])}
            cmd += ["--settings", str(self.session_settings(job))]
            if job["stage"] in ("review", "fixing"):
                cmd += ["--disallowedTools", "WebFetch"]
        if browser:
            qa = preview.PREVIEW.qa_browser(job["id"], job["worktree"])  # the office can see QA's browser, now or once someone opens it
            cmd += ["--mcp-config", str(self.session_mcp(job, port, qa)) if SANDBOX or qa else "harness/loop-mcp.json",
                    "--allowedTools", "mcp__playwright"]
        if STREAM:
            cmd += ["--verbose", "--include-partial-messages", "--forward-subagent-text"]
        attempt = job.get("attempts", 0) + 1
        live = stream.Session(job["id"], job["stage"],
                              self.home / "streams" / f"{job['id']}-{attempt}{'-' + agent if agent else ''}.jsonl",
                              evidence=Path(job["worktree"]) / "harness/evidence" / job["id"], agent=agent)
        member = f"{job['id']}:{agent or 'main'}:{port}"  # the team the office shows: who works on what, now (P33)
        self.state.setdefault("team", {})[member] = {"job": job["id"], "role": agent or ("architect" if job.get("kind") == "design" else
                                                                            "learner" if job.get("kind") == "rule" else
                                                                            {"fixing": "fixer"}.get(job["stage"], "coder")),
                                                     "model": model,
                                                     "stage": job["stage"], "since": now()}
        proc = subprocess.Popen(cmd, cwd=job["worktree"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, start_new_session=True)
        self.procs.add(proc)
        if not lens:
            preview.PREVIEW.session_start(job["id"], port, job["worktree"], job["stage"])  # the office's live app
        lines, errs = [], []

        def pump(pipe, keep, feed=None):
            for line in pipe:
                keep.append(line)
                if feed:
                    feed(line)
        readers = [threading.Thread(target=pump, args=(proc.stdout, lines, live.feed if STREAM else None), daemon=True),
                   threading.Thread(target=pump, args=(proc.stderr, errs), daemon=True)]
        for r in readers:
            r.start()
        timed_out = False
        try:
            proc.wait(timeout=SESSION_TIMEOUT)
        except subprocess.TimeoutExpired:
            timed_out = True
            kill_group(proc)
            stop_processes_in(job["worktree"])
            proc.wait()
        for r in readers:  # a process the session left behind may hold the pipe: never wait on it for long
            r.join(30)
        self.procs.discard(proc)
        self.held_ports.discard(port)
        self.state.get("team", {}).pop(member, None)
        if not lens:
            preview.PREVIEW.session_end(job["id"])
            stop_processes_in(job["worktree"])
        d = final_result(lines)
        out, err = (json.dumps(d) if d is not None else "".join(lines)), "".join(errs)
        log = self.home / "sessions" / f"{job['id']}-{attempt}.log"
        log.parent.mkdir(exist_ok=True)
        with log.open("a") as f:  # every session of this attempt: its result (the stream is in streams/), stderr
            f.write(f"=== {now()} {job['stage']} exit {proc.returncode}\n--- stdout\n{out}\n--- stderr\n{err}\n")
        if timed_out:
            with (self.home / "loop.log").open("a") as f:
                f.write(f"{now()} {job['id']} session ran over {SESSION_TIMEOUT / 60:.0f} min; killed\n")
            return 0.0, ("timeout" if online() else "infra"), ""  # with the network down, the network stalled it
        if d is None:
            tail = [x for x in err.splitlines() if x.strip() and not re.match(r"\s*(warning|ignoring)\b", x, re.I)][-5:]
            with (self.home / "loop.log").open("a") as f:
                f.write(f"{now()} {job['id']} claude gave no result (exit {proc.returncode}): "
                        f"{' | '.join(tail)[-800:] or 'no stderr'}; full output in {log}\n")
            if LIMIT.search(err):
                job["limit_message"] = tail[-1] if tail else "usage limit"
                return 0.0, "limit", ""
            if API_DOWN.search(err):
                job["infra_message"] = tail[-1] if tail else "API unreachable"
                return 0.0, "infra", ""
            if AUTH.search(err):
                job["infra_message"] = tail[-1] if tail else "not logged in"
                return 0.0, "auth", ""
            return 0.0, "no-json", ""
        subtype = d.get("subtype", "unknown")
        usage = d.get("usage") or {}
        telemetry = {  # what the session did, for the scorecard: turns, tokens, cost by model
            "turns": d.get("num_turns"), "session_id": d.get("session_id"),
            "tokens": {"in": usage.get("input_tokens", 0), "out": usage.get("output_tokens", 0),
                       "cache_read": usage.get("cache_read_input_tokens", 0),
                       "cache_write": usage.get("cache_creation_input_tokens", 0)},
            "by_model": {m: round(u.get("costUSD", 0), 4) for m, u in (d.get("modelUsage") or {}).items()}}
        if agent:
            job.setdefault("lens_telemetry", {})[agent] = telemetry  # the stage adds its lenses up
        else:
            job["last_telemetry"] = telemetry
        if d.get("is_error") and LIMIT.search(str(d.get("result") or "")):
            job["limit_message"] = str(d.get("result"))[:200]
            return float(d.get("total_cost_usd", 0)), "limit", ""
        if d.get("is_error") and API_DOWN.search(str(d.get("result") or "")):
            job["infra_message"] = str(d.get("result"))[:200]
            return float(d.get("total_cost_usd", 0)), "infra", ""
        if d.get("is_error") and AUTH.search(str(d.get("result") or "")):
            job["infra_message"] = str(d.get("result"))[:200]
            return float(d.get("total_cost_usd", 0)), "auth", ""
        if subtype == "success" and (d.get("is_error") or proc.returncode != 0):
            subtype = "error"  # seen with the network down: "success", is_error, and an API error as the result
        return float(d.get("total_cost_usd", 0)), subtype, str(d.get("result") or "")

    def agent_def(self, job, agent):
        """--agents <file> with main's definition, when the job's worktree has none: it was made before a kit upgrade
        that added the agent. Seen on the web trial: the dispatcher failed on three held PRs with "--agent
        'dispatcher' not found". Agent files are protected, so main's copy is the one any branch would have."""
        if (Path(job["worktree"]) / f".claude/agents/{agent}.md").exists():
            return []
        src = self.root / f".claude/agents/{agent}.md"
        if not src.exists():
            return []
        _, head, body = src.read_text().split("---", 2)
        fields = dict(line.split(":", 1) for line in head.strip().splitlines() if ":" in line)
        spec = {"description": fields.get("description", "").strip(), "prompt": body.strip()}
        if fields.get("tools"):
            spec["tools"] = [t.strip() for t in fields["tools"].split(",") if t.strip()]
        if fields.get("model"):
            spec["model"] = fields["model"].strip()
        f = self.home / "sandbox" / f"agent-{agent}.json"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps({agent: spec}))
        return ["--agents", str(f)]

    def session_settings(self, job):
        """The sandbox for one session: harness/loop-settings.json as main has it (never the branch's copy) and
        what the stack adds (stack.json "sandbox": allowUnixSockets, allowedDomains, excludedCommands)."""
        base = json.loads((self.root / "harness/loop-settings.json").read_text())
        box, extra = base.setdefault("sandbox", {}), self.stack.get("sandbox", {})
        net = box.setdefault("network", {})
        net["allowedDomains"] = net.get("allowedDomains", []) + extra.get("allowedDomains", [])
        if extra.get("allowUnixSockets"):
            net["allowUnixSockets"] = net.get("allowUnixSockets", []) + extra["allowUnixSockets"]
        if extra.get("excludedCommands"):
            box["excludedCommands"] = box.get("excludedCommands", []) + extra["excludedCommands"]
        f = self.home / "sandbox" / f"{job['id']}-{job['stage']}.json"
        f.parent.mkdir(exist_ok=True)
        f.write_text(json.dumps(base, indent=2))
        return f

    def session_mcp(self, job, port, cdp=None):
        """The browser for one session: in the sandbox it may open only this lane's app; with `cdp`, it is the
        Chrome the office's camera watches (preview.qa_browser)."""
        cfg = json.loads((self.root / "harness/loop-mcp.json").read_text())
        for server in cfg.get("mcpServers", {}).values():
            if any("playwright" in a for a in server.get("args", [])):
                if SANDBOX:
                    server["args"] = server["args"] + ["--allowed-origins", f"http://localhost:{port};http://127.0.0.1:{port}"]
                if cdp:
                    server["args"] = server["args"] + ["--cdp-endpoint", cdp]
        f = self.home / "sandbox" / f"{job['id']}-{job['stage']}-mcp.json"
        f.parent.mkdir(exist_ok=True)
        f.write_text(json.dumps(cfg, indent=2))
        return f

    def rung(self, job):
        """Where a build stands on the model ladder (DESIGN.md 15.3, P30): 0 the default model, 1 the same at high
        effort, 2 the same with the advisor (the large model) planning first, 3 the large model. Each failed attempt
        goes one up, and the last try is on 3; a design, a rule or an L feature starts there. Then a human decides."""
        f = self.main.get(job["id"], {})
        n = job.get("attempts", 0)
        if job.get("kind") or f.get("complexity") == "L":
            r = 3
        else:  # the last try --retries allows is always on the large model, whatever rungs that skips
            r = 3 if n and n >= self.opts.retries else min(n, 2)
        if job.get("kind") != "design" and self.day_share() >= DAY_SHED[1]:
            r = min(r, 1)  # near the daily cap: no large model, as advisor or coder; a design still gets it
        return r

    def max_attempts(self, job):
        """Tries after the first: --retries (3 by default, one per rung); one that starts on the large model, at most 2."""
        f = self.main.get(job["id"], {})
        return min(self.opts.retries, 2) if job.get("kind") or f.get("complexity") == "L" else self.opts.retries

    def model_for(self, job):
        return self.opts.large_model if self.rung(job) == 3 else self.opts.model

    def fix_model(self, job):
        """The large model fixes, except (LOOP_FIX_SONNET=1) a first fix of an S/M feature's review or CI bugs:
        conflicts, the human's answers and second rounds stay on it. Turned off by itself if under 70% of the
        first 20 such fixes merged without another round."""
        stats = self.state.setdefault("fix_stats", {"tries": 0, "ok": 0})
        if (FIX_SONNET and not stats.get("off") and job["fix_rounds"] == 1 and not job.get("fix_guard_base")
                and not job.get("fix_from_human")
                and self.main.get(job["id"], {}).get("complexity", "M") in ("S", "M")):
            job["fixed_by_default_model"] = True
            return self.opts.model
        if job.get("kind") != "design" and self.day_share() >= DAY_SHED[1]:
            return self.opts.model  # near the daily cap
        return self.opts.large_model

    def infra_wait(self):
        n = self.state.get("infra_pauses", 0)
        self.state["infra_pauses"] = n + 1
        return time.time() + INFRA_PAUSE * (1, 2, 4, 6)[min(n, 3)]

    def pause(self, job, stage, kind="limit"):
        """Claude's usage limit, its API unreachable, or Claude Code logged out stopped this session: keep the job
        as it was and pause Claude work until the reset (the API answers, a later try). Not the job's fault: no
        attempt is used. Logged out, the loop tries again every AUTH_PAUSE and tells the owner once."""
        infra = kind == "infra"
        if kind == "auth":
            message = job.pop("infra_message", "not logged in")
            self.state.setdefault("auth_since", int(time.time()))
            until, why = time.time() + AUTH_PAUSE, "Claude Code is logged out on this machine (run claude, then /login)"
        elif infra:
            message = job.pop("infra_message", "Claude's API unreachable")
            self.state.setdefault("infra_since", time.time())
            until, why = self.infra_wait(), "Claude's API unreachable"
            down = time.time() - self.state["infra_since"]
            if down > OFFLINE_MAX:
                self.state["stop_now"] = True
                self.state["stop_reason"] = f"Claude's API unreachable for {down / 60:.0f} min ({message[:120]})"
        else:
            message = job.pop("limit_message", "usage limit")
            until, why = limit_resume(message), "Claude usage limit"
        if until > self.state.get("paused_until", 0):
            self.state["paused_until"], self.state["pause_kind"] = until, kind
            resumes = datetime.datetime.fromtimestamp(until).strftime('%H:%M')
            self.event("loop", f"paused: {why} ({message[:120]}); resumes {resumes}")
            key = f"auth:{self.state['auth_since']}" if kind == "auth" else f"{kind}:{int(until) // 600}"  # logged out: once
            self.push(f"pause:{key}", lang.say("Loop paused"), lang.say("{why}; resumes {resumes}.", why=why, resumes=resumes))
        if stage == "building":
            self.set_stage(job, "queued", note="waits for the usage limit to reset")  # not an attempt
        elif stage == "fixing":  # undo the half-done fix; the review runs again and asks for the fix again
            git("reset", "-q", "--hard", job["fix_base"], cwd=job["worktree"])
            git("clean", "-q", "-fd", cwd=job["worktree"])
            job["fix_rounds"] -= 1 if not job.get("fix_guard_base") else 0
            if job.pop("fix_guard_base", None):
                job["conflict_rounds"] = 0  # the conflict is still there; it is handed over again after the reset
            self.set_stage(job, "review", note="waits for the usage limit to reset")
        else:
            self.set_stage(job, "review", note="waits for the usage limit to reset")

    def paused(self):
        if time.time() < self.state.get("paused_until", 0):
            return True
        if self.state.get("paused_until") and self.state.get("pause_kind") == "infra" and not api_reachable():
            self.state["paused_until"] = self.infra_wait()  # still down: wait longer before trying a session
            return True
        if self.state.pop("paused_until", None):
            kind = self.state.pop("pause_kind", "limit")
            self.event("loop", "resumed: " + {"infra": "Claude's API answers again", "auth": "trying Claude again"}.get(
                kind, "the usage limit has reset"))
        return False

    def count(self, job, holder, stage):
        """Add a finished session's cost to its job, the run and its milestone, once."""
        if holder.get("counted"):  # a finish retried after a network error was counted already
            return
        holder["counted"] = True
        self.caps.pop(job["id"], None)
        cost = float(holder.get("result", {}).get("cost", 0))
        job["cost"] = round(job.get("cost", 0) + cost, 4)
        self.state["spent"] = round(self.state["spent"] + cost, 4)
        job.setdefault("sessions", []).append({"stage": stage, "model": job.get("last_model"),
                                               "cost": round(cost, 4), "seconds": holder.get("seconds", 0),
                                               "ended": now(), **job.pop("last_telemetry", {})})
        job["seconds"] = job.get("seconds", 0) + holder.get("seconds", 0)
        ms = self.milestone_of(job)
        if ms:
            spent = self.state["milestone_spent"]
            spent[ms] = round(spent.get(ms, 0) + cost, 4)
