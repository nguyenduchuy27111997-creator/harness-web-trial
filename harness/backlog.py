"""The backlog, read and written in one place.

  harness/features.json      what each feature is (id, milestone, priority, title,
                             acceptance, type, complexity, depends_on); humans change it
  harness/status/<id>.json   where it stands: status, notes, blocked_reason, attempts;
                             no file means `failing`
  harness/log/<id>.md        its session log, newest entry first

One file per feature lets parallel PRs record progress without ever touching the
same file. Projects from before kit 4 kept status fields inside features.json;
those still count when a feature has no status file yet.
"""
import json
import subprocess
from pathlib import Path

FEATURES = "harness/features.json"
STATUS_DIR = "harness/status"
LOG_DIR = "harness/log"
STATUS_FIELDS = ("status", "notes", "blocked_reason", "attempts")


def _git(root, *args):
    r = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def _show(root, ref, path):
    """File content at a ref ('' = working tree, ':' = index)."""
    if not ref:
        p = Path(root) / path
        return p.read_text() if p.exists() else None
    return _git(root, "show", f":{path}" if ref == ":" else f"{ref}:{path}")


def _status_files(root, ref):
    if not ref:
        d = Path(root) / STATUS_DIR
        return sorted(f"{STATUS_DIR}/{p.name}" for p in d.glob("*.json")) if d.is_dir() else []
    out = _git(root, "ls-files", STATUS_DIR) if ref == ":" else _git(root, "ls-tree", "-r", "--name-only", ref, STATUS_DIR)
    return sorted(p for p in (out or "").splitlines() if p.endswith(".json"))


def definitions(root=".", ref=""):
    text = _show(root, ref, FEATURES)
    return json.loads(text)["features"] if text else []


def statuses(root=".", ref=""):
    """Feature id -> its status file's fields."""
    found = {}
    for path in _status_files(root, ref):
        text = _show(root, ref, path)
        if text is not None:
            found[Path(path).stem] = json.loads(text)
    return found


def read(root=".", ref=""):
    """Every feature: its definition merged with its status (default `failing`)."""
    state = statuses(root, ref)
    merged = []
    for f in definitions(root, ref):
        f = {"status": "failing", "notes": "", **f}
        f.update(state.get(f["id"], {}))
        merged.append(f)
    return merged


def write_status(fid, root=".", **fields):
    path = Path(root) / STATUS_DIR / f"{fid}.json"
    current = json.loads(path.read_text()) if path.exists() else {"status": "failing", "notes": ""}
    current.update({k: v for k, v in fields.items() if v is not None})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n")
    return current
