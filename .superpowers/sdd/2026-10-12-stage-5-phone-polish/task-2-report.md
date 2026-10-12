# Task 2 report: launchd service scripts

Implemented scripts/plist.mjs (renderPlist, parsePlistOptions, LABEL), scripts/service.mjs (install/uninstall/status/restart, --dry-run, --help), scripts/vitest.config.mjs, scripts/plist.test.mjs (5 tests), root package.json service:* scripts, root vitest projects now include 'scripts'.

TDD: RED `npx vitest run scripts` failed (cannot import ./plist.mjs). GREEN: 5 passed. Full `npm test` run before commit.
Verified `node scripts/service.mjs --help` and `install|restart --dry-run` print the plist and launchctl commands. No launchctl / service:install executed.

Concerns: nodePath is process.execPath, which under Homebrew is a versioned Cellar path (breaks after `brew upgrade node`; re-run service:install). Options are remembered by parsing the existing plist (port, dataDir, publicOrigin). Manual install and logout check left to the controller.
