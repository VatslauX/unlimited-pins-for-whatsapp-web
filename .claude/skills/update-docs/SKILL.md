---
name: update-docs
description: Use before every git commit in this repo (and when the user says "update docs"). Brings README, CHANGELOG, CLAUDE.md, the .claude/rules files and PRIVACY in line with the pending code changes.
context: fork
agent: general-purpose
model: haiku
background: true
disallowed-tools: Agent
---

# Update docs before commit

Keep the Markdown docs of "Unlimited Pins for WhatsApp Web (unofficial)" in sync with the code about to be committed.

## Steps

1. See what is changing: `git status --short`, `git diff --cached` and `git diff`. If only `.md` files changed, or nothing changed, skip this skill.
2. Read the changed source files where the diff alone doesn't show the behaviour.
3. Check each doc below against the change and edit only what has become wrong or incomplete. Leave unrelated wording alone.
4. Don't bump versions yourself. Flag any required version bump or other decision for the user.
5. **Report and hand off.** List changed docs (one line each) and decisions needed. Do not stage or commit. The caller stages the intended files, runs `review` on the pending changes, then commits only after findings are resolved.

## Docs and when they change

- **README.md**: user-facing only, in the same style as tweaks-for-degiro's README. Features, Installation, Privacy & safety, Notes & limitations. No files, commands, tests or release steps (those go in CLAUDE.md).
- **CHANGELOG.md**: add bullets for user-visible changes under the newest heading `## X.Y.Z — YYYY-MM-DD`.
  - If `extension/manifest.json` has a version newer than the top heading, create that heading with today's date.
  - If the version wasn't bumped and the top entry is already released, add the bullets under `## Unreleased` and flag that the version needs a bump.
  - Follow the existing style: short bullets, a **bold feature name** first, plain language. Leave out internal changes unless they matter to users.
- **CLAUDE.md**: developer and agent information: commands, the project map, running locally, releasing, testing against the real WhatsApp Web. Keep it concise and don't copy README content into it.
- **`.claude/rules/`**: `extension-architecture.md` when the worlds, the `<html>` attributes, the hooked WhatsApp internals, the pin rule or how pins are applied change; `extension-security.md` when a security or store invariant changes; `test-fixtures.md` when the fake WhatsApp, the harness or the e2e fixtures change.
- **PRIVACY.md**: update it, and its "Last updated" date, only if permissions, accessed data, storage or network behaviour change.

## Style

Plain, concise English matching the surrounding text. Never imply WhatsApp or Meta affiliation; the name is always "Unlimited Pins for WhatsApp Web (unofficial)". Never put real chat ids or phone numbers in examples.
