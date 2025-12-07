# Release Notes v0.2.2

**Release Date:** December 7, 2025

## Summary

Bug fix release that resolves Turso sync configuration validation errors during initialization, and adds comprehensive test coverage for core services.

## Bug Fixes

- **Sync config validation**: Fixed Turso sync setup failing during `unikortex init` with validation errors:
  - `sync.url` no longer requires strict URL validation (allows `libsql://` protocol)
  - `sync.syncInterval` now accepts 0 (disabled) instead of requiring positive values
  - Sync config is now set atomically to avoid partial validation errors

- **Code formatting**: Fixed Prettier formatting issues in `sync.ts` and `turso.ts`

- **libsql bundling**: Fixed "Dynamic require of path is not supported" error by excluding `@libsql/client` from bundling

## Improvements

- **Test coverage**: Added 50 new tests across core services:
  - EntryService: 22 tests (create, get, update, delete, list, search, tags)
  - ProjectService: 18 tests (create, get, update, delete, list, edge cases)
  - SyncManager: 10 tests (sync operations, push/pull, status)
  - Total test count: 90 (up from 40)

## Upgrade

```bash
npx @unikortex/cli@0.2.2 init --force
```

Or if already installed:

```bash
npm update @unikortex/cli
```
