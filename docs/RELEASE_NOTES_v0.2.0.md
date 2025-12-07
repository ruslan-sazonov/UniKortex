# v0.2.0 - Multi-Device Sync

This release introduces **multi-device sync** powered by [Turso](https://turso.tech), allowing you to sync your UniKortex knowledge base across multiple devices.

## New Features

### Multi-Device Sync with Turso

- **Sync your knowledge base** across all your devices using Turso's free cloud SQLite
- **Local-first architecture** - data is always stored locally for fast access
- **Hybrid approach** - data syncs to cloud, vector embeddings rebuild locally on each device
- **Auto-sync** - changes push automatically on write and pull before read (when enabled)
- **Conflict resolution** - latest update wins based on timestamps

### New CLI Commands

```bash
unikortex sync                 # Sync with remote database
unikortex sync setup <url>     # Configure Turso database
unikortex sync status          # Show sync status
unikortex sync enable          # Enable sync
unikortex sync disable         # Disable sync
```

### Interactive Init

The `unikortex init` command now offers an interactive storage mode selection:

- **Local only** - Store data on this device only (default)
- **Multi-device sync** - Sync across devices using Turso

Or use flags directly:

```bash
unikortex init --local   # Local-only mode
unikortex init --sync    # Multi-device sync mode
```

## Getting Started with Sync

1. Sign up at [turso.tech](https://turso.tech) (free)
2. Create a database named "unikortex"
3. Copy your database URL and auth token
4. Run: `unikortex sync setup libsql://your-db.turso.io your-token`

**Free tier includes:** 9GB storage, 1 billion row reads/month - more than enough for personal use.

## MCP Integration

When using sync mode with Claude Desktop, Claude Code, or other MCP clients:

- Data automatically syncs before searches and reads
- New entries push to cloud immediately after saving
- Works seamlessly across all your devices

## Technical Details

- Added `@libsql/client` as optional dependency for Turso connectivity
- New `SyncManager` class coordinates local storage, remote sync, and embeddings
- New `TursoSyncService` handles direct communication with Turso
- Soft deletes with `deleted_at` column for proper sync handling
- Delta sync using `updatedAt` timestamps for efficiency

## Upgrading

```bash
npm install -g @unikortex/cli@0.2.0
```

Existing installations continue to work in local-only mode. To enable sync:

```bash
unikortex sync setup <your-turso-url> <your-auth-token>
```

---

**Full Changelog**: https://github.com/ruslan-sazonov/UniKortex/compare/v0.1.6...v0.2.0
