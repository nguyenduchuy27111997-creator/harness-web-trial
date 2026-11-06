#!/usr/bin/env python3
"""Video recaps (DESIGN.md 14.14): a short film of each merged feature, and of each day, for the History tab.

A feature's film: its title card with the numbers (time to merge, cost, fix rounds, PR), what it changed (files and
lines, from git), its app the first and the last time the office saw it (the lane's film), the verifier's screenshots,
and the merge. A day's film: the day's card, then each feature merged that day. The words are made from the numbers
(no tokens) and read by macOS `say` (Linh in Vietnamese, Samantha in English) over a quiet sine pad. Cards are HTML
drawn by headless Chrome, the same one the office's camera uses; the film is put together by ffmpeg, at nice 15.
Without ffmpeg, say or Chrome there is no film, and the loop says so once. LOOP_RECAP=0 turns it off.
Out: <home>/history/recap/<F039>.mp4 and <home>/history/recap/<2026-11-06>.mp4."""
import datetime
import html
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import history
import lang

W, H, SCENE = 1280, 720, 3.5  # seconds a picture stays, at least
NICE = ["nice", "-n", "15"] if shutil.which("nice") else []

CARD = """<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;width:{w}px;height:{h}px;background:linear-gradient(135deg,#f4ecff,#e8f3ff 60%,#fff4ea);
font-family:-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;color:#2d2a3e;display:flex;align-items:center}}
main{{padding:0 96px}} small{{font-size:26px;color:#7C9CFF;font-weight:700;letter-spacing:.04em}}
h1{{font-size:56px;line-height:1.15;margin:14px 0 26px;letter-spacing:-.02em}} p{{font-size:28px;color:#6d6880;margin:0;line-height:1.5}}
</style><main><small>{kicker}</small><h1>{title}</h1><p>{line}</p></main>"""


def tools():
    """ffmpeg, say and a Chrome, or None when one is missing."""
    import preview  # the office's Chrome
    found = shutil.which("ffmpeg"), shutil.which("say"), preview.chrome()
    return found if all(found) else None


def card(chrome, folder, name, kicker, title, line):
    f = folder / f"{name}.html"
    f.write_text(CARD.format(w=W, h=H, kicker=html.escape(kicker), title=html.escape(title), line=html.escape(line)))
    png = folder / f"{name}.png"
    subprocess.run([*NICE, chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={W},{H}",
                    f"--user-data-dir={folder / 'chrome'}", "--no-first-run", "--use-mock-keychain", f"--screenshot={png}", f.as_uri()],
                   capture_output=True, timeout=60)
    return png if png.exists() else None


def stills(home, root, job):
    """The lane's app the first and last time the office saw it, then up to three of the verifier's screenshots."""
    film = Path(home) / "film" / job["id"]
    shots = sorted((p for p in film.glob("*.jpg") if p.stem.isdigit()), key=lambda p: int(p.stem))
    seen = [shots[0], shots[-1]] if len(shots) > 1 else shots
    ev = Path(root) / "harness/evidence" / job["id"]
    proof = sorted(p for p in ev.glob("*.png") if "mobile" not in p.name and "hover" not in p.name)[:3] if ev.is_dir() else []
    return seen + proof


def changed(root, sha):
    """(files, added, deleted) of the merge commit."""
    out = subprocess.run(["git", "show", "--shortstat", "--format=", sha], cwd=root, capture_output=True, text=True).stdout
    n = [int(x) for x in re.findall(r"(\d+) (?:files? changed|insertions?|deletions?)", out)]
    return tuple(n + [0] * (3 - len(n)))[:3] if n else (0, 0, 0)


def minutes(job):
    return max(1, round((job.get("lead_seconds") or job.get("seconds") or 0) / 60))


def words(job, files):
    say = lang.say
    return " ".join([
        say("{id}: {title}.", id=job["id"], title=job.get("title", "")),
        say("Merged after {m} minutes, for {c} dollars.", m=minutes(job), c=f"{job.get('cost', 0):.2f}"),
        say("It changed {n} files.", n=files) if files else "",
        say("Review sent it back {n} times before it passed.", n=job["fix_rounds"]) if job.get("fix_rounds") else
        say("It passed review the first time."),
    ]).strip()


def film(ffmpeg, scenes, text, out, voice_name):
    """The pictures, each at least SCENE seconds and together as long as the words, with the voice over a soft pad."""
    with tempfile.TemporaryDirectory() as tmp:
        voice = Path(tmp) / "voice.aiff"
        subprocess.run([*NICE, "say", "-v", voice_name, "-o", str(voice), text], capture_output=True, timeout=120)
        probe = subprocess.run([ffmpeg.replace("ffmpeg", "ffprobe"), "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", str(voice)], capture_output=True, text=True).stdout.strip()
        talk = float(probe) if re.fullmatch(r"[\d.]+", probe) else 0.0
        each = max(SCENE, (talk + 1.5) / len(scenes))
        total = each * len(scenes)
        cmd = [*NICE, ffmpeg, "-y", "-v", "error"]
        for s in scenes:
            cmd += ["-loop", "1", "-t", f"{each:.2f}", "-i", str(s)]
        has_voice = voice.exists() and talk > 0
        if has_voice:
            cmd += ["-i", str(voice)]
        cmd += ["-f", "lavfi", "-t", f"{total:.2f}", "-i",
                "aevalsrc='0.04*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.25*t))+0.03*sin(2*PI*330*t)':s=44100"]
        fit = "".join(f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0xf4f1fa,"
                      f"setsar=1,fps=30,fade=t=in:st=0:d=0.3,fade=t=out:st={each - 0.3:.2f}:d=0.3[v{i}];" for i in range(len(scenes)))
        video = "".join(f"[v{i}]" for i in range(len(scenes))) + f"concat=n={len(scenes)}:v=1:a=0[v]"
        pad = len(scenes) + (1 if has_voice else 0)
        audio = f";[{len(scenes)}:a]adelay=600|600[s];[s][{pad}:a]amix=inputs=2:duration=longest:normalize=0[a]" if has_voice \
            else f";[{pad}:a]anull[a]"
        cmd += ["-filter_complex", fit + video + audio, "-map", "[v]", "-map", "[a]", "-t", f"{total:.2f}",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
                "-movflags", "+faststart", str(out)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        return out if r.returncode == 0 and out.exists() else None


def folder(home):
    f = Path(home) / "history" / "recap"
    f.mkdir(parents=True, exist_ok=True)
    return f


def voice():
    return "Linh" if lang.lang() == "vi" else "Samantha"


def feature(home, root, job):
    """history/recap/<id>.mp4 for a merged feature, or None when a tool is missing or ffmpeg failed."""
    t = tools()
    if not t:
        return None
    ffmpeg, _, chrome = t
    files, added, deleted = changed(root, job["merge_sha"]) if job.get("merge_sha") else (0, 0, 0)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        say = lang.say
        cards = [card(chrome, tmp, "title", job["id"], job.get("title", ""),
                      say("{m} min to merge · ${c} · {r} fix rounds · PR #{pr}", m=minutes(job), c=f"{job.get('cost', 0):.2f}",
                          r=job.get("fix_rounds", 0), pr=job.get("pr", "–")))]
        if files:
            cards.append(card(chrome, tmp, "code", say("The code"), say("{n} files changed", n=files),
                              say("+{a} lines, −{d} lines", a=added, d=deleted)))
        end = card(chrome, tmp, "merge", say("Merged"), job.get("title", ""),
                   say("#{pr} into main at {at}", pr=job.get("pr", "–"), at=(job.get("merged_at") or "")[11:16]))
        scenes = [c for c in cards if c] + stills(home, root, job) + ([end] if end else [])
        return film(ffmpeg, scenes, words(job, files), folder(home) / f"{job['id']}.mp4", voice()) if scenes else None


def day(home, root, state, d):
    """history/recap/<day>.mp4: the day's card, then each feature merged that day, read from the day's summary."""
    t = tools()
    if not t:
        return None
    ffmpeg, _, chrome = t
    f = history.facts(home, state, d)
    summary = Path(home) / "history" / "summary" / f"{d}.md"
    text = re.sub(r"^#.*\n+", "", summary.read_text()) if summary.exists() else history.plain(f)
    text = re.sub(r"[`*_#\[\]]", "", text)[:1500]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        say = lang.say
        scenes = [card(chrome, tmp, "day", d, say("{n} merged", n=len(f["merged"])), say("${s} spent", s=f"{f['spent']:.2f}"))]
        for i, m in enumerate(f["merged"][:12]):
            job = state.get("jobs", {}).get(m["id"], {"id": m["id"]})
            scenes.append(card(chrome, tmp, f"m{i}", m["id"], m["title"], say("{m} min to merge · ${c}", m=minutes(job), c=f"{job.get('cost', 0):.2f}")))
            last = stills(home, root, job)[1:2] or stills(home, root, job)[:1]
            scenes += last
        scenes = [s for s in scenes if s]
        return film(ffmpeg, scenes, text, folder(home) / f"{d}.mp4", voice()) if scenes else None


def made(home):
    """The films there are: {"features": {id: bytes}, "days": {day: bytes}}."""
    out = {"features": {}, "days": {}}
    for p in folder(home).glob("*.mp4"):
        out["days" if history.DAY.match(p.stem) else "features"][p.stem] = p.stat().st_size
    return out


def wanted(home, state, days=2):
    """What to film next, newest first: features merged in the last `days` days without a film, then days with a
    summary and no film. Off with LOOP_RECAP=0."""
    if os.environ.get("LOOP_RECAP") == "0":
        return []
    have = made(home)
    since = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    jobs = sorted((j for j in state.get("jobs", {}).values() if j.get("stage") == "merged" and not j.get("kind")
                   and (j.get("merged_at") or "") >= since and j["id"] not in have["features"]),
                  key=lambda j: j.get("merged_at") or "", reverse=True)
    out = [("feature", j["id"]) for j in jobs]
    out += [("day", x["day"]) for x in history.days(home)[-3:] if x["summary"] and x["day"] not in have["days"]
            and x["day"] < datetime.date.today().isoformat()]
    return out


def make(home, root, state, what):
    kind, key = what
    return feature(home, root, state["jobs"][key]) if kind == "feature" else day(home, root, state, key)


if __name__ == "__main__":  # python3 harness/recap.py <home> <root> F039|2026-11-06: one film by hand
    import sys
    h, r, k = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    s = json.loads((h / "state.json").read_text())
    print(make(h, r, s, ("day" if history.DAY.match(k) else "feature", k)))
