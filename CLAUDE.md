# CLAUDE.md

Project guidance for Claude Code working in this repository.

## Project

Unofficial Manifest V3 Chrome extension that lets WhatsApp Web (`https://web.whatsapp.com/`) pin more than 3 chats in its own chat list. The extension is plain JavaScript with no runtime dependencies or bundler; only `extension/` ships. Keep the shipped source directly runnable. Do not add a build step, TypeScript source, or framework unless a Firefox build, runtime package, UI framework, or substantially larger codebase makes that necessary.

## Common commands

```sh
npm test                   # typecheck, lint, unit, integration, e2e (CI and humans)
npm run test:unit
npm run test:integration   # about 35 s; one test waits for the 30 s 'missing' status
npm run test:e2e           # Chromium with the unpacked extension against a mocked web.whatsapp.com
npm run test:coverage      # unit+integration coverage of extension/
npm run typecheck
npm run lint
npm run build              # dist/unlimited-pins-for-whatsapp-web-<manifest version>.zip
npm run icons              # scripts/icon.svg -> extension/icons/*.png (needs rsvg-convert)
npm run sync-common        # after editing extension/common.js: copies it to common-isolated.js
```

## Shell command scope

- Run shell commands with the repository as the working directory. Use repository-relative paths and keep command inputs, outputs, and file changes inside this repository.
- Do not use absolute paths, `..` path traversal, or commands that read or write outside the repository. Do not change to another directory as part of a command.
- Keep commands transparent to Claude Code's permission checker: avoid heredocs, `python -`/`node -` stdin scripts, `eval`, and opaque encoded or dynamically generated shell code. For project file edits, use Claude Code's file editing tools or a project-local script with a clear path; then run the relevant project command separately.
- Prefer the documented npm scripts for checks. If Claude Code blocks a command because it cannot inspect its effects, restructure it as a direct, repository-scoped command rather than trying to bypass the permission check.

## Project map

- `extension/`: shipped extension. Source architecture and security requirements are in `.claude/rules/extension-architecture.md` and `.claude/rules/extension-security.md`.
- `tests/unit/`: static checks for the manifest, source safety, translations, store publishing, and GitHub Actions pins (every `uses:` is a commit SHA with a version comment, and Dependabot tracks actions), plus the `common.js` helpers.
- `tests/integration/`, `tests/e2e/`, `tests/fixtures/`: behavior against a fake of WhatsApp's internals. See `.claude/rules/test-fixtures.md`.
- `scripts/`: build, icons, the `common.js` copy, and Chrome Web Store publishing (`cws-publish.js`).
- `.github/workflows/`: CI (`test.yml`), release (`release.yml`: a pushed `v<manifest version>` tag tests, builds, submits the zip to the Chrome Web Store for review and creates a GitHub Release), and a manual read-only store login check (`cws-auth-check.yml`). Both store workflows sign in with keyless Workload Identity Federation from the repository variables `GCP_WIF_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `CWS_PUBLISHER_ID`, `CWS_ITEM_ID`. Actions are pinned to commit SHAs (the release job holds the Web Store token); `.github/dependabot.yml` updates the pins and the npm dev dependencies weekly. Minor and patch updates are grouped; majors get their own PR.

The manifest version lives only in `extension/manifest.json`; `package.json` has no version. CI runs `npm test` on pushes to `main` and pull requests.

## Releasing

Use the `release` skill (`.claude/skills/release/`) before every release: it runs the pre-release gate and ends with a go/no-go report. Only the user decides to release; push the `v<version>` tag only after their explicit yes to that report. The tag push is what submits the build to the Chrome Web Store.

## Testing against the real WhatsApp Web

The tests never contact WhatsApp. Checking the live page (for example after a WhatsApp update) is done by hand in the user's own logged-in tab. Never let a test or a manual check reach WhatsApp's servers with a pin past the limit: before trying a pin path in the live page, replace `WAWebChatPinBridge.setPin` with a stub that only records its arguments, and reload the page afterwards to undo everything.
