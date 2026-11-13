#!/usr/bin/env python3
"""The owner's language for what the loop tells them (DESIGN.md 14.14): pushes (ntfy, macOS) and the day's summary.
LOOP_LANG=vi (the default) or en. The English template is the key, with {name} for values, as in the office's
viewer/src/i18n.ts; a template with no Vietnamese line goes out in English. events.log stays English."""
import os

VI = {
    "{id} needs you": "{id} cần bạn",
    "{n} questions need you": "{n} câu hỏi cần bạn",
    "Check {id} against what you meant": "Kiểm tra {id} có đúng ý bạn không",
    "{title}. Looks right? Comment /ok, or /bug <what is off>, on the PR.": "{title}. Đúng chưa? Comment /ok, hoặc /bug <chỗ sai>, trên PR.",
    "CI runner stuck": "Runner CI bị kẹt", "CI runner still stuck": "Runner CI vẫn kẹt",
    "{why}. Restart it, or allow the loop to: loop.py runner on.": "{why}. Khởi động lại nó, hoặc cho loop tự làm: loop.py runner on.",
    "{why}, after 3 restarts. Check the Mac and the runner.": "{why}, sau 3 lần khởi động lại. Kiểm tra máy Mac và runner.",
    "Milestone {ms} done": "Milestone {ms} xong", "Every feature of {ms} is merged. Next: /release {ms}.": "Mọi feature của {ms} đã merge. Tiếp theo: /release {ms}.",
    "CI is not starting": "CI không chạy",
    "Main's CI fails on infrastructure": "CI của main lỗi hạ tầng",
    "GitHub Actions starts no jobs (billing or runner). Nothing merges until it does.":
        "GitHub Actions không chạy job nào (billing hoặc runner). Không gì merge được cho tới khi nó chạy.",
    "Loop paused": "Loop tạm dừng", "{why}; resumes {resumes}.": "{why}; chạy lại {resumes}.",
    "{ms} budget used": "Hết ngân sách {ms}", "{ms} spent ${spent} of ${cap}; its features wait for more.": "{ms} đã tiêu ${spent} trên ${cap}; các feature của nó chờ thêm ngân sách.",
    "Daily cap reached": "Đã chạm trần ngày",
    "Dispatcher decided": "Dispatcher đã quyết",
    "${spent} of ${cap} spent today; new sessions wait for tomorrow.": "Hôm nay đã tiêu ${spent} trên ${cap}; phiên mới chờ sang ngày mai.",
    "Budget used": "Hết ngân sách",
    "Spent ${spent} of ${budget}; work in flight finishes, nothing new starts.": "Đã tiêu ${spent} trên ${budget}; việc đang làm sẽ xong, không nhận việc mới.",
    "Loop offline": "Loop mất mạng", "GitHub unreachable since {since}; the loop waits and goes on by itself.": "Không tới được GitHub từ {since}; loop chờ và tự chạy tiếp.",
    "Loop stopped: {why}": "Loop đã dừng: {why}",
    # alerts (watch.py)
    "{id}: {detail}": "{id}: {detail}",
    "no news for {m} min in {stage}": "không có tin gì {m} phút ở {stage}",
    "It may be thinking hard, or stuck on a command. Open Focus on it; the session times out at 90 minutes.":
        "Có thể đang nghĩ lâu, hoặc kẹt ở một lệnh. Mở Focus để xem; session tự dừng sau 90 phút.",
    "edited {path} {n} times in 15 min": "sửa {path} {n} lần trong 15 phút", "It may be going in circles on this file.": "Có thể đang loay hoay với file này.",
    "'{name}' failed {n} runs in a row": "'{name}' đỏ {n} lần liền", "The same test keeps failing ({file}).": "Cùng một test cứ đỏ ({file}).",
    "the session is at {p}% of its context": "session đã dùng {p}% context", "the {role} subagent is at {p}% of its context": "subagent {role} đã dùng {p}% context",
    "Claude Code compacts it soon; earlier details may be lost.": "Claude Code sắp nén context; chi tiết cũ có thể mất.",
    "spent ${spent} of ${budget}": "đã tiêu ${spent} trên ${budget}", "The loop stops taking features at the budget.": "Hết ngân sách thì loop ngừng nhận feature.",
    "building": "build", "review": "review", "fixing": "sửa",
    # the day's summary without Claude (history.py)
    "Merged {n}: {list}": "Đã merge {n}: {list}", "Nothing merged.": "Không có gì được merge.", "Spent ${spent}.": "Đã tiêu ${spent}.",
    "Stumbles: {list}.": "Chỗ vấp: {list}.", "Waiting on you: {list}.": "Đang chờ bạn: {list}.",
    # questions to the office (ask.py)
    "Questions are turned off (LOOP_ASK=0).": "Hỏi đáp đang tắt (LOOP_ASK=0).",
    "Today's ${cap} for questions is used up: ask again tomorrow.": "Đã dùng hết ${cap} cho hỏi đáp hôm nay: mai hỏi tiếp nhé.",
    "No answer this time: try again.": "Lần này không có câu trả lời: thử lại nhé.",
    # the films (recap.py)
    "{id}: {title}.": "{id}: {title}.", "Merged after {m} minutes, for {c} dollars.": "Đã merge sau {m} phút, tốn {c} đô.",
    "It changed {n} files.": "Đổi {n} file.", "Review sent it back {n} times before it passed.": "Review trả lại {n} lần rồi mới qua.",
    "It passed review the first time.": "Qua review ngay lần đầu.",
    "{m} min to merge · ${c} · {r} fix rounds · PR #{pr}": "{m} phút tới merge · ${c} · {r} vòng sửa · PR #{pr}",
    "The code": "Code", "{n} files changed": "{n} file thay đổi", "+{a} lines, −{d} lines": "+{a} dòng, −{d} dòng",
    "Merged": "Đã merge", "#{pr} into main at {at}": "#{pr} vào main lúc {at}",
    "{n} merged": "{n} feature đã merge", "${s} spent": "Đã tiêu ${s}", "{m} min to merge · ${c}": "{m} phút tới merge · ${c}",
}


def lang():
    return "en" if os.environ.get("LOOP_LANG", "vi").lower().startswith("en") else "vi"


def say(template, **params):
    """The template in the owner's language with its values. A value that is itself a template (a stage) is said too."""
    text = VI.get(template, template) if lang() == "vi" else template
    return text.format(**{k: (VI.get(v, v) if lang() == "vi" and isinstance(v, str) else v) for k, v in params.items()})
