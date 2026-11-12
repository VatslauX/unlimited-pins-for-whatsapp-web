---
name: release
description: Use before pushing a release tag (`v<version>`) of Unlimited Pins for WhatsApp Web, and when the user says "release", "prepare release" or "release check". Runs the pre-release gate in the main session - preflight (branch, version, CHANGELOG, CI, build, GitHub code-scanning and Dependabot alerts), the full test suite, a read-only check of WhatsApp's internals in the user's own logged-in tab - and ends with a go/no-go report. Pushes the tag itself only after the user explicitly confirms the GO report in chat.
argument-hint: "[--skip-site]  (skip the live WhatsApp check only when the user says so; the report then says NO-GO for WhatsApp internals unverified)"
---

# Release gate

Run this in the main session, not in a fork. It needs the Chrome tools and may have to wait for the user to open WhatsApp Web.

Only the user decides when to release. This skill checks and reports; it creates and pushes the release tag only after the user explicitly confirms in chat, in response to this skill's own GO report — never on a standing approval from earlier in the conversation or from a prior release. It never bumps the version or edits `CHANGELOG.md` on its own (ask first), and commits carry no Co-Authored-By/AI trailer (see memory).

Pushing `v<version>` runs `.github/workflows/release.yml`: full tests, `npm run build`, upload to the Chrome Web Store and submit for review (`scripts/cws-publish.js`), then a GitHub Release with the zip. The tag must equal `v` + the manifest version, or the workflow stops before testing.

## Hard rules for the live WhatsApp page

- **Read-only, and never past the pin limit** (CLAUDE.md, `.claude/rules/extension-security.md`). Never pin, unpin, archive, send or open chat menus. Never log in or scan a QR code: if the tab shows the login screen, ask the user and continue with the steps that don't need the site.
- Use the user's own logged-in WhatsApp Web tab only if they point you to it; otherwise open a new tab at `https://web.whatsapp.com/` and **leave it open**. Never close the user's tabs.
- Before running anything that could reach a pin path, replace `WAWebChatPinBridge.setPin` with a stub that only records its arguments. When done, reload the tab to undo every patch.
- No `fetch`/XHR from the JS tool.
- **Probe output is shape-only**: `typeof`, counts, booleans. Never chat names, ids, phone numbers or message text. Save nothing from the live page in the repo.

## 1. Preflight (fail fast)

Run these and collect pass/fail for each one. Keep going after a failure so the report lists every problem at once.

```
git branch --show-current            # main
git status --short                   # empty
git fetch origin && git rev-list --left-right --count origin/main...HEAD   # 0 0
node -p "require('./extension/manifest.json').version"
git tag --list 'v*' --sort=-v:refname | head -1
git ls-remote --tags origin
```

- The manifest version is newer than the latest tag, and `v<version>` doesn't exist yet locally or on `origin`.
- `CHANGELOG.md`: the top heading is `## <version> — <YYYY-MM-DD>` (today's or the planned release date), and no `## Unreleased` section is left. If one is left, or the date is missing, ask the user, then make the change and commit it.
- CI: run `head_sha=$(git rev-parse HEAD)` then `gh run list --workflow test.yml --commit "$head_sha" -L 1 --json headSha,conclusion,status`. Pass only if `headSha` equals `$head_sha` and `conclusion` is `success`.
- `npm run build`, then `unzip -l dist/unlimited-pins-for-whatsapp-web-<version>.zip`: only files from `extension/`, the manifest at the root, no `.DS_Store`, tests or `node_modules`.
- The manifest still has `"permissions": ["storage"]`, the name `Unlimited Pins for WhatsApp Web (unofficial)`, and `minimum_chrome_version` ≥ 111 (the unit tests check this too, but it blocks the store).
- If features were added since the last tag (`git log v<last>..HEAD --oneline`), README and PRIVACY mention them.
- Store setup: `gh variable list` shows `GCP_WIF_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `CWS_PUBLISHER_ID`, `CWS_ITEM_ID`. If any is missing, the publish job fails after the tests pass: NO-GO. If they were changed since the last release, ask the user to run the `CWS auth check` workflow from `main` first (`gh workflow run cws-auth-check.yml`, needs their OK).

### Security alert gate

**No new high or critical alert ships in a release**, on either surface. Check both every time; they are separate APIs.

**Baseline**: the previous release's `publishedAt` (`gh release list -L 1`, `gh release view v<last> --json publishedAt -q .publishedAt`). Use the remote, not local tags. With no previous release, every open high/critical alert counts as new.

Code scanning:

```
gh api repos/VatslauX/unlimited-pins-for-whatsapp-web/code-scanning/alerts --paginate \
  -q '.[] | select(.state=="open") | select(.rule.security_severity_level=="high" or .rule.security_severity_level=="critical") | "\(.number)\t\(.created_at)\t\(.rule.id)\t\(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line)"'
gh api "repos/VatslauX/unlimited-pins-for-whatsapp-web/code-scanning/analyses?ref=refs/heads/main&per_page=30" -q '.[] | "\(.commit_sha)\t\(.tool.name)\t\(.created_at)"'
```

- A new open high/critical alert is **NO-GO**, in any file, including `.github/workflows/` and `scripts/`: the release job holds the Chrome Web Store token.
- An alert already open at the previous release is a note: name it with number and age, and ask whether to fix it now.
- Empty alert output only counts if an analysis covers `HEAD`, or an ancestor whose later commits touch nothing scanned (`git diff --stat <sha>..HEAD`: docs, `.claude/`, Markdown). Otherwise the gate is **not evaluated**: NO-GO.

Dependabot:

```
gh api repos/VatslauX/unlimited-pins-for-whatsapp-web/dependabot/alerts --paginate \
  -q '.[] | select(.state=="open") | select(.security_advisory.severity=="high" or .security_advisory.severity=="critical") | "\(.number)\t\(.created_at)\t\(.dependency.package.name)\t\(.dependency.scope)\t\(.security_advisory.ghsa_id)\tfix:\(.security_vulnerability.first_patched_version.identifier // "none")"'
```

- Same baseline rule. `runtime` scope blocks. `development` scope is a note: the extension has no runtime dependencies and the zip has only `extension/` (confirm with `grep -rl <package> extension/`; a vendored copy blocks). A `null` or unknown scope blocks until you've read the alert. An alert on an action used by `release.yml` or `cws-auth-check.yml` blocks.
- A failed API call is *not evaluated*, not a pass.

Never dismiss an alert yourself or suggest dismissal to clear the gate; that is the user's call.

## 2. Full test suite

Start `npm test` in the background right after preflight (it takes a few minutes; integration alone is about 35 s, plus e2e), so it overlaps step 3. Don't poll; wait for the notification. The release needs every stage (typecheck, lint, unit, integration, e2e) to pass. Report any retried/flaky e2e test.

## 3. Live WhatsApp check (Claude in Chrome)

Load the `anthropic-skills:chrome-browser` skill, then the Chrome tools in one ToolSearch call (`tabs_context_mcp`, `tabs_create_mcp`, `navigate`, `javascript_tool`, `read_page`). Call `tabs_context_mcp`, then follow the hard rules above for which tab to use. Wait until the chat list has loaded.

**Smoke check**: `typeof window.require`. If it is not `"function"`, the JS tool isn't in the page's main world, or WhatsApp changed its module loader: mark the internals unverified (or drift, if the page is clearly loaded).

**Stub first**, then probe. Build the probe from the current `extension/pins.js` (the module and export names it uses), not from memory. Shape only:

```js
(() => {
  const req = n => { try { return window.require(n); } catch (e) { return null; } };
  const Bridge = req('WAWebChatPinBridge');
  if (Bridge && typeof Bridge.setPin === 'function') {
    const calls = window.__upinsStubCalls = [];
    Bridge.setPin = (...a) => { calls.push(a.length); return Promise.resolve(); };
  }
  const Chat = req('WAWebCollections')?.Chat;
  const Action = req('WAWebSetPinChatAction');
  const models = Chat?.getModelsArray?.() || [];
  return JSON.stringify({
    collectionsChat: !!Chat,
    chatOn: typeof Chat?.on,
    chatModels: models.length,
    pinIsNumber: models.length ? typeof models[0].pin === 'number' : 'no chats',
    pinnedCount: models.filter(c => c.pin > 0).length,
    bridgeGetPinLimit: typeof Bridge?.getPinLimit,
    bridgeSetPinStubbed: !!window.__upinsStubCalls,
    actionSetPin: typeof Action?.setPin,
    upStatus: document.documentElement.getAttribute('data-up-status')
  });
})()
```

Extend it when a feature added since the last tag relies on more of WhatsApp (`git diff --stat v<last>..HEAD -- extension/`). Keep the stub in place for anything you add.

**Drift**: a missing module or export (`null`/`"undefined"`), `pin` no longer a number, `Chat.on` not a function. Compare with `tests/fixtures/fake-whatsapp.js`: if the live shape differs from the fake, the fix includes updating the fake (`.claude/rules/test-fixtures.md`).

**Extension output (conditional)**: if the user has the release candidate loaded unpacked (ask; don't change their extensions), `upStatus` should be `ready`. `missing` or stuck `loading` on a loaded page is drift. Without the candidate, mark it `UNVERIFIED (release candidate not loaded)`; that alone doesn't change GO/NO-GO.

Then **reload the tab** to undo the stub.

## 4. Go/no-go report

Wait for the test result, then report:

1. **Verdict**: GO or NO-GO, with the version and commit (`git rev-parse --short HEAD`).
2. **Preflight**: one line per check, pass/fail.
3. **Security alerts**: both surfaces, each alert marked new (blocking) or pre-existing (note), or "not evaluated" with the reason.
4. **Tests**: pass/fail per stage, and every failure (`file:line`, title).
5. **WhatsApp internals**: the probe result, drift found, differences from the fake.
6. **Unverified**: the extension output if no candidate was loaded, anything skipped with `--skip-site`.

NO-GO if any preflight check fails, a new high or critical alert is open (or a gate couldn't be evaluated), any test fails, or WhatsApp's internals drifted. Fix each defect with a test that fails without the fix (and the fake updated to match the live page), run `npm test`, commit, and run this skill again.

On GO, state the exact commands and ask the user to explicitly confirm:

```
git tag v<version> && git push origin v<version>
```

Only after an explicit yes in chat, in response to this report, run them. This is the irreversible step: it submits the build to the Chrome Web Store. If time has passed since the report, confirm the version once more. After pushing, watch the run (`gh run watch`) and report its outcome; the store review itself takes longer.
