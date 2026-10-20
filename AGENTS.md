# AppLens working rules

AppLens is a local software analysis CLI and MCP server. Keep user documentation
in Chinese, retain the original license and licenses/COPYRIGHT_NOTICE.md, and never
claim unavailable providers or skipped checks passed. Do not modify sibling projects.

## Development

Use the versions in .nvmrc and package.json. Run npm ci, npm run build:cached,
and npm run check:fast. Windows source analysis requires the verified addon in
native/windows/build; build it through the native CI job before testing.
Run npm run test:windows and npm run verify:windows:smoke on a real Windows host.
Changes to native ownership require npm run verify:windows-native.

Preserve inward architecture, typed errors, immutable evidence, selected input
paths, resource bounds, cancellation and cleanup ownership. Never substitute
mocked tests for real provider verification. Runtime analysis may only execute
explicitly selected, owned test fixtures. Do not install tools or register clients
without explicit user intent. Use setup dry runs before any configuration change.
Never commit credentials, node_modules, dist, .cache or native binaries; ship
verified native binaries through CI artifacts and release packages.

## Publication

Keep actual provenance in licenses/COPYRIGHT_NOTICE.md and all license notices. README
and runtime branding use AppLens. Avoid unsupported platform or npm claims.
Record validation honestly in docs/VALIDATION.md, including remaining failures.
