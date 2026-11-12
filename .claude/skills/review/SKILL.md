---
name: review
description: Use after every development task in this repo (any change to extension/, tests/ or scripts/), before every git commit (after update-docs), and when the user says "review" or "code review". Runs in its own sub-agent with a fresh context. Reviews pending changes against the pin rule, the security and store rules and the architecture, runs the relevant tests, and reports findings by priority.
context: fork
agent: general-purpose
background: true
disallowed-tools: Agent
---

# Code review

You run in a separate sub-agent with a fresh context: you see only the working tree, not the conversation that made the change. Work from `git diff` and the files. Report only: don't fix, commit, push, stash, check out, or otherwise rewrite the working tree. The session that called you fixes the findings.

Review the changes about to be committed for "Unlimited Pins for WhatsApp Web (unofficial)". Find real defects, not style. The unit tests already enforce the static rules (manifest, forbidden APIs, translations, action pins). Look for what they miss.

Background to read first: `.claude/rules/extension-architecture.md`, `.claude/rules/extension-security.md`, and, when tests or fixtures changed, `.claude/rules/test-fixtures.md`.

## Steps

1. **Collect the change.** Run `git status --short`, `git diff`, `git diff --cached`, and list untracked files. If only `.md` files changed, check only the doc rules below and skip the tests; report tests as `SKIPPED (docs-only change)` in the opening line.
2. **Start the tests now**, with Bash, `run_in_background: true` and `timeout: 600000`, and keep reviewing meanwhile. Never contact the real WhatsApp. Pick by what changed:
   - `extension/` changed: `npm test` (the full suite takes about a minute here).
   - only `tests/` or `scripts/` changed: the matching stages, e.g. `npm run test:unit`, `npm run test:integration`, `npx playwright test tests/e2e/pins.spec.js`, plus `npm run typecheck && npm run lint`.
   - `.github/workflows/` changed: `npm run test:unit` (it checks the action pins).

   Before writing the report, wait for the shell's completion notification and read the output once. Don't poll or `sleep`.
3. **Read every changed source file in full**, not just the hunks. For changes to `common.js`, also read the scripts that use the changed names (`grep -n "<name>" extension/*.js`).
4. **Check the change against the checklist below.** For each suspected problem, trace it in the code or reproduce it with a test before reporting it. Drop anything you can't back up.
5. **Report** in the format below. The calling session fixes P1 findings before any commit (or asks the user when the fix is a judgement call), and never commits with a failing test.

## Checklist

**The pin rule.** This is the reason the extension is safe to use. A pin past WhatsApp's limit that reaches WhatsApp's servers could get the user's account flagged.
- Both `WAWebSetPinChatAction.setPin` and `WAWebChatPinBridge.setPin` apply the rule: a new pin goes to WhatsApp only while the native pins (pinned chats not in our list, newsletters excluded) are fewer than the **original** limit, never the raised one.
- No new path reaches the original `Bridge.setPin` with a pin past the limit: a new caller, a retry, an exception path (an exception while pinning must resolve without calling the original), a race between two tabs, or a stored list that arrives late.
- Unpinning a chat in our list stays local; unpinning a native pin goes to WhatsApp.
- `getPinLimit` is raised only for non-newsletters, and is called with a chat id, not a model.
- If WhatsApp's modules are missing or renamed, the extension does nothing (status `loading`/`missing`) and WhatsApp works unchanged: no exception, no half-patched state.

**Security and store rules** (`.claude/rules/extension-security.md`). Also look for workarounds the static tests miss.
- Permissions are only `storage`. No `host_permissions`, `web_accessible_resources`, `externally_connectable` or background script. Content scripts match only `https://web.whatsapp.com/*`, top frame.
- No network access of any kind (`fetch`, XHR, `sendBeacon`, `WebSocket`, `EventSource`, remote URLs, injected `<script>`), no `eval`/`new Function`/string timers, no `postMessage`.
- No `console.log/info/debug`; `console.error` only for unexpected exceptions, and never with a chat id (chat ids contain phone numbers).
- Pins only in `chrome.storage.local`, and only from `bridge.js`. Never `storage.sync`, `localStorage`, `sessionStorage` or IndexedDB.
- `innerHTML` only ever set to `''`; no `insertAdjacentHTML`, `setHTMLUnsafe`, `document.write`.
- Name, `minimum_chrome_version` ≥ 111, and every `extDescription` ≤ 132 characters ending with its "not affiliated" phrase.

**Execution worlds and the attribute bridge.**
- MAIN-world files (`common.js`, `pins.js`) use no `chrome.*`; isolated-world files (`common-isolated.js`, `bridge.js`) don't reach `window.require`.
- `common.js` was edited → `npm run sync-common` was run and `common-isolated.js` matches.
- A new file is listed in both `manifest.json` and the matching `tsconfig.*.json` `files`.
- Everything read from `data-up-pins`, `data-up-save` or storage goes through `readPins`/`sanitize`; a partly valid list never replaces the stored one. The page can write these attributes.
- `bridge.js` still ignores its own writes (per-tab id); `pins.js` doesn't save before the stored list arrived. Look for echo loops and lost pins when two tabs change pins quickly.

**Applying pins.**
- Every `chat.set()` the extension makes runs in a `setTimeout(…, 0)`; a `set()` inside WhatsApp's own change event doesn't re-sort the list.
- Stored pins are re-applied on `change:pin`, `add` and `reset`, without a render loop (our own `set()` re-triggering itself).
- Work per event stays cheap: no full pass over every chat on every change event without need.

**Tests.** Every changed or new behaviour is covered.
- Unit (`tests/unit/`) for logic without a page: `common.js` helpers, the manifest, static source rules, translations, workflows, store publishing.
- Integration (`tests/integration/`) for logic across inputs, tabs and races: the pin rule, storage timing, late module loading.
- E2E (`tests/e2e/`) for Chrome's real two worlds, `chrome.storage.local`, reloads and tabs, and the rendered list order.
- Any change to the pin rule has a test asserting what reached `serverCalls` (the fake server). Missing coverage there is P1; elsewhere P2.
- A test must fail without the change. Don't break the working tree to check: point `UP_EXTENSION_DIR` at a scratch copy (see `.claude/rules/test-fixtures.md`), or report it as unverified.
- When the change relies on WhatsApp behaviour the fake doesn't have, `tests/fixtures/fake-whatsapp.js` is extended to match the live page. The fake must not drift from WhatsApp.
- No scratch files left in `tests/`.

**Docs.** `update-docs` normally handles these; just check them.
- CHANGELOG has the user-visible change. README stays user-only (no commands, files or release steps). PRIVACY.md is updated if stored or accessed data changed. CLAUDE.md or `.claude/rules/` match changed architecture.
- The manifest version is bumped only when the user asked for it.

## Report format

Start with one line: what you reviewed (files, about how many lines) and the test result (passed/failed per stage), or `SKIPPED (docs-only change)`. List each test failure (stage, `file:line`, title, error lines).

Then the findings, most severe first. Each finding gets:
- its priority:
  - **P1**: could send a pin past the limit, breaks a security or store rule, loses the user's pins, or breaks pinning. Blocks the commit.
  - **P2**: breaks quietly in some state (late module load, several tabs, newsletters), or wastes work.
  - **P3**: minor.
- `file:line`;
- the concrete failure: which input or page state leads to what wrong result;
- the proposed fix;
- whether it is **confirmed** (traced or reproduced) or **likely**.

If nothing survives checking, say "No findings". Then list any open questions for the user. Keep it short, and don't restate the checklist.
