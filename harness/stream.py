"""What loop sessions are doing, live: `claude -p --output-format stream-json` lines turned into small events
for the dashboard (and the office viewer). One `Session` per Claude run reads its lines; `BUS` holds the last
events of every session and every loop event, numbered, for /stream (SSE) and /snapshot.json.

An event: {id, at, job, stage, role, kind, ...}. role is "main" for the session the loop started (with agent: its
name when it runs as one, --agent reviewer), or the subagent's type (reviewer, verifier, architect...). kinds:
  session_start {model}         text {text}            thinking {tokens}
  tool {tool, use_id, what}     tool_delta {use_id, partial}   (Write/Edit input as it streams)
  tool_done {use_id, error}     file_edit {path, tool, doc, old, new}
  subagent_start {use_id, description}   subagent_end {use_id, status}
  verdict {verdict}             shot {name}            session_end {subtype, cost, models}
  usage {model, context, output, window, parent}       (each model call: the context it read, what it wrote)
  todo {items: [{text, status}]}                       (the agent's TodoWrite list)
  criterion {n, verdict, note}                         (the verifier's line for acceptance item n)
  event {text}                  (a line of events.log)
Text is masked like the audit hook masks tool input. Unknown lines are skipped: the loop never depends on this."""
import collections
import datetime
import json
import re
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "hooks"))
from audit import SECRET, mask  # noqa: E402


def mask_whole(text):
    """mask() without its 2000-character cut, for a whole file shown in the office."""
    return SECRET.sub(lambda m: (m.group(2) or "") + "***", text)

EDITS = ("Write", "Edit", "MultiEdit")
CRITERION = re.compile(r"^\W*CRITERION\s+(\d+)\s*:\s*(PASS|FAIL)\b\s*[—–:-]?\s*(.*)$", re.M)
SUBAGENT_TOOLS = ("Agent", "Task")


def now():
    return datetime.datetime.now().isoformat(timespec="milliseconds")


class Bus:
    """The last `size` events, numbered from 1. Publishing never blocks on readers."""

    def __init__(self, size=5000):
        self.events = collections.deque(maxlen=size)
        self.last = 0
        self.cond = threading.Condition()

    def publish(self, event):
        with self.cond:
            self.last += 1
            event = {"id": self.last, "at": now(), **event}
            self.events.append(event)
            self.cond.notify_all()
        return event

    def since(self, last_id, timeout=None):
        """Events after last_id; waits up to timeout seconds for one when there is none yet."""
        with self.cond:
            if self.last <= last_id and timeout:
                self.cond.wait(timeout)
            return [e for e in self.events if e["id"] > last_id]

    def snapshot(self, per_job=200):
        """The last per_job events of each job, oldest first, and the id to follow /stream from."""
        with self.cond:
            events, last = list(self.events), self.last
        kept, count = [], collections.Counter()
        for e in reversed(events):
            if count[e.get("job")] < per_job:
                count[e.get("job")] += 1
                kept.append(e)
        return {"last": last, "events": kept[::-1]}


BUS = Bus()


class Session:
    """Turns one session's stream-json lines into events on the bus and in its stream file."""

    def __init__(self, job, stage, path, evidence=None, bus=BUS, keep=None, agent=None):
        self.job, self.stage, self.path, self.bus = job, stage, Path(path), bus
        self.agent = agent  # the agent the session runs as (--agent reviewer, dispatcher...): on its own events
        self.roles = {}  # Agent/Task tool_use id -> subagent type
        self.blocks = {}  # streamed content block index -> tool_use id of a Write/Edit being written
        self.result = None
        self.evidence, self.seen, self.looked = Path(evidence) if evidence else None, set(), 0.0
        self.model, self.calls = None, set()  # the main session's model; subagent messages already counted
        self.said = set()  # verdicts and criteria already on the bus (a report comes as text and as a hand-back)
        self.windows_file = self.path.parent / "windows.json"  # each model's context window, from earlier results
        try:
            self.windows = json.loads(self.windows_file.read_text())
        except (OSError, ValueError):
            self.windows = {}
        if self.evidence and self.evidence.is_dir():  # screenshots of an earlier session are not news
            self.seen = {p.name for p in self.evidence.glob("*.png")}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        for old in sorted(self.path.parent.glob("*.jsonl"), key=lambda p: p.stat().st_mtime)[:-keep] if keep else []:
            old.unlink(missing_ok=True)  # the newest `keep` stream files stay (the loop keeps days instead: history.py)

    def emit(self, role, kind, **fields):
        if role == "main" and self.agent:
            fields["agent"] = self.agent
        event = self.bus.publish({"job": self.job, "stage": self.stage, "role": role, "kind": kind, **fields})
        with self.path.open("a") as f:
            f.write(json.dumps(event) + "\n")

    def feed(self, line):
        """One stdout line. Returns the parsed line (the loop keeps the final `result`), or None."""
        try:
            d = json.loads(line)
        except ValueError:
            return None
        if not isinstance(d, dict):
            return None
        try:
            self.read(d)
            self.shots()
        except Exception:  # a shape this does not know never breaks the session
            pass
        return d

    def shots(self, every=3.0):
        """A screenshot the verifier just saved, at most one look every `every` seconds."""
        if not self.evidence or time.monotonic() - self.looked < every:
            return
        self.looked = time.monotonic()
        for p in sorted(self.evidence.glob("*.png")) if self.evidence.is_dir() else []:
            if p.name not in self.seen:
                self.seen.add(p.name)
                self.emit("verifier", "shot", name=p.name)

    def role(self, d):
        parent = d.get("parent_tool_use_id")
        return self.roles.get(parent, "subagent") if parent else "main"

    def read(self, d):
        kind, sub = d.get("type"), d.get("subtype")
        if kind == "result":
            self.result = d
            models = {m: {"cost": u.get("costUSD", 0), "window": u.get("contextWindow")}
                      for m, u in (d.get("modelUsage") or {}).items() if isinstance(u, dict)}
            known = {m: v["window"] for m, v in models.items() if v["window"]}
            if known and any(self.windows.get(m) != w for m, w in known.items()):
                self.windows.update(known)
                try:
                    self.windows_file.write_text(json.dumps(self.windows))
                except OSError:
                    pass
            self.emit("main", "session_end", subtype=sub, cost=d.get("total_cost_usd", 0), models=models)
        elif kind == "system" and sub == "init":
            self.model = d.get("model")
            self.emit("main", "session_start", model=self.model)
        elif kind == "system" and sub == "thinking_tokens":
            self.emit(self.role(d), "thinking", tokens=d.get("estimated_tokens", 0))
        elif kind == "system" and sub == "task_started":
            if d.get("task_type", "local_agent") != "local_agent":  # a Bash command run in the background, not a subagent
                return
            self.roles[d.get("tool_use_id")] = d.get("subagent_type") or "subagent"
            self.emit(self.roles[d.get("tool_use_id")], "subagent_start", use_id=d.get("tool_use_id"),
                      description=mask(d.get("description", "")))
        elif kind == "system" and sub == "task_notification":
            if d.get("tool_use_id") not in self.roles:  # the end of a background command, not of a subagent
                return
            self.emit(self.roles.get(d.get("tool_use_id"), "subagent"), "subagent_end", use_id=d.get("tool_use_id"),
                      status=d.get("status"))
        elif kind == "stream_event":
            self.delta(d)
        elif kind == "assistant":
            self.message(d)
        elif kind == "user":
            for b in (d.get("message") or {}).get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    self.emit(self.role(d), "tool_done", use_id=b.get("tool_use_id"), error=bool(b.get("is_error")))

    def report(self, role, text):
        """A verdict, and the verifier's line for each acceptance criterion, once each."""
        for verdict in ("PASS", "FAIL"):
            if f"VERDICT: {verdict}" in text and (role, "verdict", verdict) not in self.said:
                self.said.add((role, "verdict", verdict))
                self.emit(role, "verdict", verdict=verdict)
        for n, verdict, note in CRITERION.findall(text):
            if (role, int(n), verdict) not in self.said:
                self.said.add((role, int(n), verdict))
                self.emit(role, "criterion", n=int(n), verdict=verdict, note=mask(note.strip())[:200])

    def usage(self, role, model, u, parent=None):
        """One model call: how much context it read (all input, cached or not) and how much it wrote."""
        context = sum(u.get(k) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
        self.emit(role, "usage", model=model, context=context, output=u.get("output_tokens") or 0,
                  window=self.windows.get(model), parent=parent)

    def delta(self, d):
        """Token by token, for the session the loop started (subagents arrive as whole messages)."""
        e = d.get("event") or {}
        if e.get("type") == "message_start":
            self.model = (e.get("message") or {}).get("model") or self.model
        elif e.get("type") == "message_delta" and isinstance(e.get("usage"), dict):  # the call's final count
            self.usage(self.role(d), self.model, e["usage"])
        if e.get("type") == "content_block_start":
            block = e.get("content_block") or {}
            if block.get("type") == "tool_use" and block.get("name") in EDITS:
                self.blocks[e.get("index")] = block.get("id")
        elif e.get("type") == "content_block_delta":
            delta = e.get("delta") or {}
            if delta.get("type") == "text_delta" and delta.get("text"):
                self.emit(self.role(d), "text", text=mask(delta["text"]))
            elif delta.get("type") == "input_json_delta" and e.get("index") in self.blocks and delta.get("partial_json"):
                self.emit(self.role(d), "tool_delta", use_id=self.blocks[e["index"]], partial=mask(delta["partial_json"]))
        elif e.get("type") == "content_block_stop":
            self.blocks.pop(e.get("index"), None)

    def message(self, d):
        role, sub = self.role(d), bool(d.get("parent_tool_use_id"))
        m = d.get("message") or {}
        if sub and m.get("id") not in self.calls and isinstance(m.get("usage"), dict):  # one line per content block
            self.calls.add(m.get("id"))
            self.usage(role, m.get("model"), m["usage"], parent=d.get("parent_tool_use_id"))
        for b in (d.get("message") or {}).get("content") or []:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "text" and sub:  # the main session's text already came as deltas
                self.emit(role, "text", text=mask(b.get("text", "")))
            if b.get("type") == "text":
                self.report(role, b.get("text", ""))
            if b.get("type") != "tool_use":
                continue
            name, given = b.get("name"), b.get("input") or {}
            if name == "SubagentHandback" and isinstance(given.get("message"), str):  # a background subagent's report
                self.report(role, given["message"])
            if name in SUBAGENT_TOOLS:
                self.roles[b.get("id")] = given.get("subagent_type") or "subagent"
            what = given.get("command") or given.get("file_path") or given.get("url") or given.get("pattern") \
                or given.get("description") or ""
            self.emit(role, "tool", tool=name, use_id=b.get("id"), what=mask(what)[:300])
            if name == "TodoWrite" and isinstance(given.get("todos"), list):
                self.emit(role, "todo", items=[{"text": mask(t.get("content") or t.get("activeForm") or "")[:200],
                                                "status": t.get("status", "pending")}
                                               for t in given["todos"][:30] if isinstance(t, dict)])
            if name in EDITS and given.get("file_path"):
                path = given["file_path"]
                old = given.get("old_string") or ""
                new = given.get("new_string") or given.get("content") or \
                    "\n".join(e.get("new_string", "") for e in given.get("edits") or [])
                self.emit(role, "file_edit", path=path, tool=name, doc="docs/design/" in path,
                          old=mask(old), new=mask(new))  # 2000 characters each; /diff/<id> has it all
