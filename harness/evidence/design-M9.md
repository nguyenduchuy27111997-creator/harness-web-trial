<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-21T23:08:54 on a5a5b4b9 plus working tree
- Architect run: ab533d122d8f84e02
- Design sha256: 804e9d83432aa761601c6c3aba2443de8c3ccc215245c9ea8e687353d7d98fc4

VERDICT: PASS
DESIGN: M9
CHECKED:
- Specs that move (the only change): the sentence in /Users/huynguyen/Desktop/harness-web-trial-loop/F091/docs/design/M9.md used to say "F081-cover-upload's baseline is not touched (F097)". It now says F091 redraws that baseline, because F091 moves the cover and its form into the aside. It also says the spec's steps, masks and checks do not change. That fits the M9 UI change, since the cover moving into the aside changes the page layout outside the masked areas.
- Spec unchanged: `git diff main` changes only the baseline image /Users/huynguyen/Desktop/harness-web-trial-loop/F091/e2e/__screenshots__/F081-cover-upload.spec.ts/F081-cover-upload.png (39570 -> 60175 bytes). /Users/huynguyen/Desktop/harness-web-trial-loop/F091/e2e/F081-cover-upload.spec.ts is unchanged, and its `toHaveScreenshot` masks are still the h1, the cover and the date `<p>`. Nothing it checks is loosened.
- Consistency: the line still says F097 fixed the mask, and F097 is in harness/features.json, so it still credits F097 correctly. The new line matches how every other `/books/[id]` baseline in the same bullet is handled. It does not conflict with earlier designs or decisions. Per your scope, I did not re-review the rest of the doc, which already had a PASS.
PROBLEMS:
