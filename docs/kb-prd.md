# UniKortex: Unified Knowledge Base for AI Workflows

## Product Requirements Document (PRD)

**Version:** 1.0.0-draft  
**Last Updated:** December 2024  
**Status:** Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals and Non-Goals](#3-goals-and-non-goals)
4. [User Personas](#4-user-personas)
5. [Core Concepts](#5-core-concepts)
6. [System Architecture](#6-system-architecture)
7. [Data Models](#7-data-models)
8. [CLI Specification](#8-cli-specification)
9. [API Specification](#9-api-specification)
10. [MCP Integration](#10-mcp-integration)
11. [Embedding Strategy](#11-embedding-strategy)
12. [Storage Format](#12-storage-format)
13. [Search and Retrieval](#13-search-and-retrieval)
14. [Team Features](#14-team-features)
15. [Security](#15-security)
16. [Implementation Phases](#16-implementation-phases)
17. [Project Structure](#17-project-structure)
18. [Technology Stack](#18-technology-stack)
19. [Testing Strategy](#19-testing-strategy)
20. [Deployment](#20-deployment)
21. [Success Metrics](#21-success-metrics)

---

## 1. Executive Summary

**UniKortex** is an open-source, local-first knowledge base designed to capture, organize, and retrieve knowledge artifacts generated during AI-assisted workflows. It provides seamless integration with Claude (via MCP) and ChatGPT (via Custom GPT Actions), enabling users to save and query their accumulated knowledge directly from AI conversations.

### Key Value Propositions

- **Zero-config start**: `npm install -g @anthropic-community/unikortex && unikortex init` gets you running
- **AI-native**: Built specifically for AI workflow integration, not retrofitted
- **Local-first**: All data stored locally by default, no mandatory cloud services
- **Team-ready**: Scales from personal use to team collaboration
- **Open format**: Markdown files with YAML frontmatter, compatible with Obsidian and other tools
- **Hybrid search**: Combines semantic (vector) and keyword search for optimal retrieval

---

## 2. Problem Statement

### Current Pain Points

1. **Fragmented knowledge**: Valuable insights, decisions, and artifacts generated in AI conversations are scattered across Claude Projects, ChatGPT chats, and manual notes

2. **No cross-platform context**: Context built up in Claude doesn't transfer to ChatGPT and vice versa

3. **Poor organization**: Even within a single platform, organizing artifacts by project/topic is limited to flat folder structures

4. **Manual export burden**: Users must manually copy-paste or download artifacts, breaking workflow

5. **No semantic retrieval**: Finding relevant past decisions requires remembering exact keywords or manually browsing

### Market Gap

Existing solutions address parts of this problem:

| Tool | What it solves | What it lacks |
|------|---------------|---------------|
| OpenMemory/Mem0 | Cross-platform preference sync | No structured artifact storage |
| AnythingLLM | RAG over documents | No AI chat integration for capture |
| Obsidian + plugins | Organization, local storage | No native AI integration |
| MCP memory servers | Claude integration | No ChatGPT support, limited organization |

**UniKortex fills the gap**: structured artifact storage + cross-platform AI integration + semantic search + team collaboration.

---

## 3. Goals and Non-Goals

### Goals (v1.0)

1. ✅ Provide CLI tool for managing knowledge entries locally
2. ✅ Support rich metadata (project, tags, type, status, relations)
3. ✅ Enable semantic search with hybrid retrieval
4. ✅ Integrate with Claude Desktop/Code via MCP
5. ✅ Integrate with ChatGPT via Custom GPT Actions
6. ✅ Store data in human-readable Markdown format
7. ✅ Support team mode with centralized server
8. ✅ Work fully offline in personal mode

### Non-Goals (v1.0)

1. ❌ Auto-capture from AI web interfaces (requires browser extension, defer to v2)
2. ❌ Real-time collaborative editing (v2)
3. ❌ Mobile app (v2)
4. ❌ Web UI dashboard (v2, CLI-first for v1)
5. ❌ Integration with other AI tools beyond Claude/ChatGPT (v2)
6. ❌ Built-in AI summarization or transformation (use the AI tools themselves)

---

## 4. User Personas

### 4.1 Solo Developer (Primary)

**Profile**: Full-stack developer working on personal/side projects  
**Tools**: Claude Pro, ChatGPT Plus, VS Code, terminal  
**Pain point**: Loses track of architectural decisions and research across multiple AI conversations  
**Usage**: 10-50 entries per month, single workspace, 2-3 projects  

**Key workflows**:
- Save architecture decisions during Claude conversations
- Query past decisions when starting new features
- Export knowledge for documentation

### 4.2 Tech Lead (Secondary)

**Profile**: Leads a team of 3-8 developers  
**Tools**: Claude Team, GitHub, Slack, documentation tools  
**Pain point**: Team knowledge scattered across individual AI conversations  
**Usage**: 50-200 entries per month across team, multiple workspaces  

**Key workflows**:
- Share architectural decisions with team
- Query team knowledge base for onboarding
- Track which decisions supersede others

### 4.3 Researcher / Knowledge Worker (Tertiary)

**Profile**: Conducts research using AI tools, needs to organize findings  
**Tools**: Multiple AI tools, Obsidian/Notion for notes  
**Pain point**: Research insights lost across AI conversations  
**Usage**: 20-100 entries per month, heavy on research type  

**Key workflows**:
- Save research findings with source attribution
- Build up knowledge graph of related concepts
- Sync with Obsidian vault

---

## 5. Core Concepts

### 5.1 Hierarchy

```
Organization (team boundary)
└── Workspace (department/area)
    └── Project (specific initiative)
        └── Entry (atomic knowledge unit)
```

**Personal mode simplification**:
- Implicit organization: `personal`
- Implicit workspace: `default`
- User manages only: Projects and Entries

### 5.2 Entry Types

| Type | Purpose | Examples |
|------|---------|----------|
| `decision` | Architectural or design decisions | "Use JWT for auth", "PostgreSQL over MongoDB" |
| `research` | Findings, comparisons, analysis | "LLM comparison 2024", "Market analysis" |
| `artifact` | Code, configs, templates | "Docker compose template", "API schema" |
| `note` | General notes, ideas | "Ideas for v2", "Meeting notes" |
| `reference` | External resources, links | "Useful blog post on RAG", "API documentation" |

### 5.3 Entry Status

| Status | Meaning |
|--------|---------|
| `draft` | Work in progress, not finalized |
| `active` | Current, valid knowledge |
| `superseded` | Replaced by newer entry (link via `supersedes` field) |
| `archived` | No longer relevant, kept for history |

### 5.4 Relations

Entries can be linked to other entries:

| Relation Type | Meaning |
|--------------|---------|
| `related` | General relationship |
| `implements` | This entry implements a decision |
| `extends` | This entry extends/builds on another |
| `contradicts` | This entry conflicts with another (requires resolution) |

---

## 6. System Architecture

### 6.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           User Interfaces                            │
├─────────────────┬─────────────────┬─────────────────┬───────────────┤
│    CLI (unikortex)     │  Claude Desktop │    ChatGPT      │  Future: Web  │
│                 │  / Claude Code  │   Custom GPT    │      UI       │
└────────┬────────┴────────┬────────┴────────┬────────┴───────────────┘
         │                 │                 │
         │ direct          │ MCP             │ REST API
         │                 │                 │
┌────────▼─────────────────▼─────────────────▼────────────────────────┐
│                         UniKortex Core Library                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │    Entry     │ │   Search     │ │  Embedding   │ │    Sync     │ │
│  │   Manager    │ │   Engine     │ │   Provider   │ │   Engine    │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └─────────────┘ │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
      ┌───────▼───────┐            ┌────────▼────────┐
      │  Local Store  │            │   Team Server   │
      │   (SQLite)    │            │  (PostgreSQL)   │
      └───────────────┘            └─────────────────┘
```

### 6.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **CLI** | User commands, local config management, output formatting |
| **Core Library** | Business logic, validation, search algorithms |
| **Entry Manager** | CRUD operations, validation, relation management |
| **Search Engine** | Hybrid search combining vector and keyword matching |
| **Embedding Provider** | Abstraction over embedding models (local/API) |
| **Sync Engine** | Offline-first sync with conflict resolution |
| **Local Store** | SQLite + sqlite-vec for personal mode |
| **Team Server** | REST API, MCP endpoint, PostgreSQL + pgvector |

### 6.3 Mode Selection

```yaml
# ~/.unikortex/config.yaml

# Personal mode (default)
mode: personal

# Team mode
mode: team
server:
  url: "https://unikortex.example.com"
  # OR for self-hosted
  url: "http://localhost:3033"
auth:
  method: api_key  # api_key | oidc
  # API key read from UNIKORTEX_API_KEY environment variable
```

---

## 7. Data Models

### 7.1 TypeScript Interfaces

```typescript
// === Core Types ===

type EntryId = string;  // Format: "unikortex_" + nanoid(12)
type UserId = string;
type ProjectId = string;
type WorkspaceId = string;
type OrganizationId = string;

type EntryType = 'decision' | 'research' | 'artifact' | 'note' | 'reference';
type EntryStatus = 'draft' | 'active' | 'superseded' | 'archived';
type RelationType = 'related' | 'implements' | 'extends' | 'contradicts';

interface Entry {
  id: EntryId;
  projectId: ProjectId;
  authorId: UserId;
  
  // Content
  title: string;
  type: EntryType;
  status: EntryStatus;
  content: string;          // Markdown content
  contextSummary: string;   // Short summary for embedding (max 500 chars)
  
  // Metadata
  tags: string[];
  supersedes?: EntryId;     // ID of entry this supersedes
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface EntryRelation {
  fromId: EntryId;
  toId: EntryId;
  relationType: RelationType;
}

interface Project {
  id: ProjectId;
  workspaceId: WorkspaceId;
  name: string;              // URL-safe slug
  displayName: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Workspace {
  id: WorkspaceId;
  organizationId: OrganizationId;
  name: string;
  displayName: string;
  createdAt: Date;
}

interface Organization {
  id: OrganizationId;
  name: string;
  displayName: string;
  createdAt: Date;
}

// === Team Types ===

type OrgRole = 'owner' | 'admin' | 'member';
type WorkspaceRole = 'admin' | 'editor' | 'viewer';

interface User {
  id: UserId;
  email: string;
  name: string;
  createdAt: Date;
}

interface OrgMembership {
  organizationId: OrganizationId;
  userId: UserId;
  role: OrgRole;
}

interface WorkspaceMembership {
  workspaceId: WorkspaceId;
  userId: UserId;
  role: WorkspaceRole;
}

// === Embedding Types ===

interface EmbeddingVector {
  entryId: EntryId;
  vector: Float32Array;  // Dimension varies by model
  model: string;         // e.g., "text-embedding-3-small"
  createdAt: Date;
}

// === Sync Types ===

type SyncAction = 'create' | 'update' | 'delete';

interface SyncLogEntry {
  id: number;
  entryId: EntryId;
  action: SyncAction;
  userId: UserId;
  timestamp: Date;
  checksum: string;      // SHA-256 of content for conflict detection
  version: number;       // Incremental version number
}

interface SyncState {
  lastSyncedAt: Date;
  lastSyncedVersion: number;
  pendingChanges: PendingChange[];
}

interface PendingChange {
  entryId: EntryId;
  action: SyncAction;
  data?: Partial<Entry>;
  localVersion: number;
  timestamp: Date;
}
```

### 7.2 SQLite Schema (Personal Mode)

```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- === Core Tables ===

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE entries (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('decision', 'research', 'artifact', 'note', 'reference')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'superseded', 'archived')),
    content TEXT NOT NULL,
    context_summary TEXT,
    
    supersedes TEXT REFERENCES entries(id) ON DELETE SET NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- For sync
    version INTEGER DEFAULT 1,
    checksum TEXT
);

CREATE TABLE entry_tags (
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (entry_id, tag)
);

CREATE TABLE entry_relations (
    from_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    to_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'related' 
        CHECK(relation_type IN ('related', 'implements', 'extends', 'contradicts')),
    PRIMARY KEY (from_id, to_id)
);

-- === Full-Text Search ===

CREATE VIRTUAL TABLE entries_fts USING fts5(
    title,
    content,
    context_summary,
    content='entries',
    content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, title, content, context_summary)
    VALUES (NEW.rowid, NEW.title, NEW.content, NEW.context_summary);
END;

CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, title, content, context_summary)
    VALUES('delete', OLD.rowid, OLD.title, OLD.content, OLD.context_summary);
END;

CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, title, content, context_summary)
    VALUES('delete', OLD.rowid, OLD.title, OLD.content, OLD.context_summary);
    INSERT INTO entries_fts(rowid, title, content, context_summary)
    VALUES (NEW.rowid, NEW.title, NEW.content, NEW.context_summary);
END;

-- === Vector Embeddings (sqlite-vec) ===

-- Created programmatically based on embedding dimension
-- Example for 512-dimensional embeddings:
-- CREATE VIRTUAL TABLE entry_embeddings USING vec0(
--     entry_id TEXT PRIMARY KEY,
--     embedding FLOAT[512]
-- );

-- === Sync Support ===

CREATE TABLE sync_state (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
    data TEXT,  -- JSON serialized entry data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- === Indexes ===

CREATE INDEX idx_entries_project ON entries(project_id);
CREATE INDEX idx_entries_type ON entries(type);
CREATE INDEX idx_entries_status ON entries(status);
CREATE INDEX idx_entries_updated ON entries(updated_at);
CREATE INDEX idx_entry_tags_tag ON entry_tags(tag);
```

### 7.3 PostgreSQL Schema (Team Mode)

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- === Organization & Users ===

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,  -- NULL for SSO users
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE org_memberships (
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

-- === Workspaces ===

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

CREATE TABLE workspace_memberships (
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- === Projects ===

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (workspace_id, name)
);

-- === Entries ===

CREATE TABLE entries (
    id TEXT PRIMARY KEY,  -- unikortex_xxxxxxxxxxxx format
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('decision', 'research', 'artifact', 'note', 'reference')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'superseded', 'archived')),
    content TEXT NOT NULL,
    context_summary TEXT,
    
    supersedes TEXT REFERENCES entries(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    version INTEGER DEFAULT 1,
    checksum TEXT
);

CREATE TABLE entry_tags (
    entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (entry_id, tag)
);

CREATE TABLE entry_relations (
    from_id TEXT REFERENCES entries(id) ON DELETE CASCADE,
    to_id TEXT REFERENCES entries(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'related',
    PRIMARY KEY (from_id, to_id)
);

-- === Embeddings ===

CREATE TABLE entry_embeddings (
    entry_id TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
    embedding vector(512),  -- Adjust dimension as needed
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entry_embeddings_vector ON entry_embeddings 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- === Audit Log ===

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    entry_id TEXT,
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- === API Keys ===

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of the key
    name TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === Full-Text Search ===

CREATE INDEX idx_entries_fts ON entries 
    USING GIN (to_tsvector('english', title || ' ' || content || ' ' || COALESCE(context_summary, '')));

-- === Row Level Security ===

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see entries in projects they have access to
CREATE POLICY entries_access ON entries
    FOR ALL
    USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN workspaces w ON p.workspace_id = w.id
            JOIN workspace_memberships wm ON w.id = wm.workspace_id
            WHERE wm.user_id = current_setting('app.current_user_id')::UUID
        )
    );
```

---

## 8. CLI Specification

### 8.1 Installation

```bash
# npm (recommended)
npm install -g @anthropic-community/unikortex

# Homebrew (macOS/Linux)
brew install unikortex

# Direct binary download
curl -sSL https://unikortex.dev/install.sh | bash
```

### 8.2 Command Reference

#### Initialization

```bash
# Initialize UniKortex in home directory
unikortex init

# Initialize with specific config
unikortex init --mode team --server https://unikortex.example.com
```

**Behavior**:
1. Creates `~/.unikortex/` directory
2. Creates `~/.unikortex/config.yaml` with defaults
3. Creates `~/.unikortex/unikortex.db` SQLite database
4. Creates `~/.unikortex/vault/` for Markdown files
5. Prompts for embedding provider preference

#### Entry Management

```bash
# Add entry (interactive mode)
unikortex add

# Add entry with options
unikortex add "Content here" \
  --title "Auth Architecture Decision" \
  --project mobile-app \
  --type decision \
  --tags auth,security,jwt \
  --status active

# Add entry from file
unikortex add --file ./decision.md --project mobile-app

# Add entry from stdin
cat document.md | unikortex add --project research --type research

# Edit entry
unikortex edit <entry-id>
# Opens in $EDITOR with current content

# Update entry metadata
unikortex update <entry-id> --status superseded --supersedes <new-entry-id>

# Delete entry
unikortex delete <entry-id>
unikortex delete <entry-id> --force  # Skip confirmation

# Show entry details
unikortex show <entry-id>
unikortex show <entry-id> --format json
unikortex show <entry-id> --include-related
```

#### Search and List

```bash
# Semantic search (default)
unikortex search "authentication best practices"

# Search with filters
unikortex search "auth" --project mobile-app --type decision --status active

# Keyword-only search
unikortex search "JWT" --mode keyword

# List entries
unikortex list
unikortex list --project mobile-app
unikortex list --type decision --status active
unikortex list --tag security
unikortex list --limit 20 --offset 0

# List with custom output
unikortex list --format json
unikortex list --format table
unikortex list --format ids-only  # Just IDs, useful for scripting
```

#### Project Management

```bash
# List projects
unikortex projects

# Create project
unikortex projects create mobile-app --display-name "Mobile App" --description "iOS/Android app"

# Delete project
unikortex projects delete mobile-app

# Show project details
unikortex projects show mobile-app
```

#### Relations

```bash
# Add relation
unikortex relate <from-id> <to-id> --type implements

# List relations for entry
unikortex relations <entry-id>

# Remove relation
unikortex unrelate <from-id> <to-id>
```

#### Export and Import

```bash
# Export all to Markdown files
unikortex export --output ./export/

# Export specific project
unikortex export --project mobile-app --output ./export/

# Export to JSON
unikortex export --format json --output ./backup.json

# Import from Markdown files
unikortex import ./documents/

# Import from JSON backup
unikortex import ./backup.json
```

#### Server and Integration

```bash
# Start local server (for MCP and API access)
unikortex serve
unikortex serve --port 3033 --host 127.0.0.1

# Output MCP config for Claude Desktop
unikortex mcp-config
# Outputs JSON to paste into claude_desktop_config.json

# Output OpenAPI spec for ChatGPT Actions
unikortex gpt-spec
unikortex gpt-spec --server-url https://unikortex.example.com
```

#### Sync (Team Mode)

```bash
# Check sync status
unikortex sync status

# Sync with server
unikortex sync

# Force push local changes
unikortex sync --push

# Force pull remote changes
unikortex sync --pull

# Resolve conflicts
unikortex sync conflicts
unikortex sync resolve <entry-id> --keep local|remote
```

#### Configuration

```bash
# Show current config
unikortex config

# Set config value
unikortex config set embeddings.provider openai
unikortex config set server.url https://unikortex.example.com

# Switch modes
unikortex config set mode team
unikortex config set mode personal
```

### 8.3 CLI Output Formats

**Default (human-readable)**:
```
$ unikortex search "authentication"

Found 3 entries:

┌─────────────────┬────────────────────────────────┬──────────┬────────────┐
│ ID              │ Title                          │ Project  │ Score      │
├─────────────────┼────────────────────────────────┼──────────┼────────────┤
│ unikortex_7x8f2m9p3q1w │ JWT Authentication Decision    │ mobile   │ 0.92       │
│ unikortex_2a3b4c5d6e7f │ OAuth2 Research                │ backend  │ 0.87       │
│ unikortex_9z8y7x6w5v4u │ Session vs Token Analysis      │ research │ 0.81       │
└─────────────────┴────────────────────────────────┴──────────┴────────────┘

Use `unikortex show <id>` to view details
```

**JSON (for scripting)**:
```json
{
  "results": [
    {
      "id": "unikortex_7x8f2m9p3q1w",
      "title": "JWT Authentication Decision",
      "project": "mobile",
      "score": 0.92,
      "snippet": "We decided to use JWT tokens with refresh..."
    }
  ],
  "total": 3,
  "query": "authentication"
}
```

---

## 9. API Specification

### 9.1 Base URL

- **Personal mode**: `http://localhost:3033/api/v1`
- **Team mode**: `https://unikortex.example.com/api/v1`

### 9.2 Authentication

**Personal mode**: No authentication required (localhost only)

**Team mode**: API key in header
```
Authorization: Bearer unikortex_live_xxxxxxxxxxxxxxxxxxxx
```

### 9.3 Endpoints

#### Entries

```yaml
# Create entry
POST /entries
Content-Type: application/json

Request:
{
  "title": "JWT Auth Decision",
  "project": "mobile-app",      # project name or ID
  "type": "decision",
  "status": "active",
  "content": "## Decision\n\nUse JWT tokens...",
  "contextSummary": "JWT-based auth with refresh tokens",
  "tags": ["auth", "security"],
  "supersedes": null
}

Response: 201 Created
{
  "id": "unikortex_7x8f2m9p3q1w",
  "title": "JWT Auth Decision",
  "project": {
    "id": "proj_xxx",
    "name": "mobile-app"
  },
  "type": "decision",
  "status": "active",
  "content": "## Decision\n\nUse JWT tokens...",
  "contextSummary": "JWT-based auth with refresh tokens",
  "tags": ["auth", "security"],
  "createdAt": "2024-12-01T10:30:00Z",
  "updatedAt": "2024-12-01T10:30:00Z"
}

# Get entry
GET /entries/{id}
GET /entries/{id}?include=relations,project

Response: 200 OK
{
  "id": "unikortex_7x8f2m9p3q1w",
  ...
  "relations": [
    {"id": "unikortex_xxx", "type": "implements", "title": "Auth Implementation"}
  ]
}

# Update entry
PATCH /entries/{id}
{
  "status": "superseded",
  "supersedes": "unikortex_newentry123"
}

# Delete entry
DELETE /entries/{id}

# List entries
GET /entries
GET /entries?project=mobile-app&type=decision&status=active&tag=auth&limit=20&offset=0

Response: 200 OK
{
  "entries": [...],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

#### Search

```yaml
# Semantic search
POST /search
{
  "query": "authentication best practices",
  "filters": {
    "project": "mobile-app",
    "type": ["decision", "research"],
    "status": "active",
    "tags": ["auth"]
  },
  "options": {
    "mode": "hybrid",           # hybrid | semantic | keyword
    "limit": 10,
    "includeContent": true,     # Include full content or just snippet
    "includeRelated": false     # Fetch 1-hop related entries
  }
}

Response: 200 OK
{
  "results": [
    {
      "id": "unikortex_7x8f2m9p3q1w",
      "title": "JWT Auth Decision",
      "project": "mobile-app",
      "type": "decision",
      "score": 0.92,
      "scoreBreakdown": {
        "semantic": 0.89,
        "keyword": 0.95
      },
      "snippet": "We decided to use JWT tokens with refresh...",
      "content": "## Decision\n\n...",  # if includeContent=true
      "highlights": [
        {"field": "content", "snippet": "...JWT <mark>authentication</mark>..."}
      ]
    }
  ],
  "total": 3,
  "searchMeta": {
    "mode": "hybrid",
    "embeddingModel": "text-embedding-3-small",
    "queryTimeMs": 45
  }
}
```

#### Context Retrieval (Optimized for LLM)

```yaml
# Get formatted context for LLM consumption
POST /context
{
  "query": "How should I implement auth?",
  "project": "mobile-app",
  "maxTokens": 4000,
  "format": "xml"  # xml | markdown | json
}

Response: 200 OK
{
  "context": "<knowledge_entries>...</knowledge_entries>",
  "entriesIncluded": 3,
  "tokensUsed": 2847,
  "truncated": false
}
```

#### Projects

```yaml
GET /projects
POST /projects
GET /projects/{id}
PATCH /projects/{id}
DELETE /projects/{id}
```

#### Relations

```yaml
# Add relation
POST /entries/{id}/relations
{
  "targetId": "unikortex_xxx",
  "type": "implements"
}

# List relations
GET /entries/{id}/relations

# Remove relation
DELETE /entries/{id}/relations/{targetId}
```

#### Sync (Team Mode)

```yaml
# Get changes since version
GET /sync/changes?since=1234

Response:
{
  "changes": [
    {
      "entryId": "unikortex_xxx",
      "action": "update",
      "version": 1235,
      "data": {...},
      "timestamp": "2024-12-01T10:30:00Z"
    }
  ],
  "currentVersion": 1240
}

# Push local changes
POST /sync/push
{
  "changes": [
    {
      "entryId": "unikortex_xxx",
      "action": "create",
      "data": {...},
      "localVersion": 5
    }
  ],
  "baseVersion": 1234
}

Response:
{
  "accepted": ["unikortex_xxx"],
  "conflicts": [],
  "newVersion": 1241
}
```

### 9.4 Error Responses

```yaml
# Standard error format
{
  "error": {
    "code": "ENTRY_NOT_FOUND",
    "message": "Entry with ID unikortex_xxx not found",
    "details": {}
  }
}

# Error codes
400: VALIDATION_ERROR, INVALID_QUERY
401: UNAUTHORIZED, INVALID_API_KEY
403: FORBIDDEN, INSUFFICIENT_PERMISSIONS
404: ENTRY_NOT_FOUND, PROJECT_NOT_FOUND
409: CONFLICT, SYNC_CONFLICT
429: RATE_LIMITED
500: INTERNAL_ERROR
```

---

## 10. MCP Integration

### 10.1 MCP Server Configuration

**For Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "unikortex": {
      "command": "unikortex",
      "args": ["mcp"],
      "env": {
        "UNIKORTEX_CONFIG_PATH": "/Users/username/.unikortex/config.yaml"
      }
    }
  }
}
```

**For Claude Code** (`.claude/mcp.json`):

```json
{
  "mcpServers": {
    "unikortex": {
      "command": "npx",
      "args": ["-y", "@anthropic-community/unikortex", "mcp"]
    }
  }
}
```

### 10.2 MCP Tools

```typescript
// Tool definitions for MCP

const tools = [
  {
    name: "unikortex_save",
    description: "Save content to the knowledge base. Use this when the user wants to save a decision, research finding, code artifact, or any valuable information for future reference.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short descriptive title for the entry"
        },
        content: {
          type: "string", 
          description: "The content to save (Markdown supported)"
        },
        project: {
          type: "string",
          description: "Project name to save under (will create if doesn't exist)"
        },
        type: {
          type: "string",
          enum: ["decision", "research", "artifact", "note", "reference"],
          description: "Type of entry"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization"
        },
        contextSummary: {
          type: "string",
          description: "Brief summary for search optimization (optional, auto-generated if not provided)"
        }
      },
      required: ["title", "content", "project", "type"]
    }
  },
  
  {
    name: "unikortex_search",
    description: "Search the knowledge base for relevant entries. Use this when the user asks about past decisions, wants to find previous research, or needs context from earlier work.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query"
        },
        project: {
          type: "string",
          description: "Filter to specific project (optional)"
        },
        type: {
          type: "string",
          enum: ["decision", "research", "artifact", "note", "reference"],
          description: "Filter by entry type (optional)"
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 5)",
          default: 5
        }
      },
      required: ["query"]
    }
  },
  
  {
    name: "unikortex_get",
    description: "Retrieve a specific entry by ID. Use when you need the full content of a known entry.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Entry ID (e.g., unikortex_7x8f2m9p3q1w)"
        },
        includeRelated: {
          type: "boolean",
          description: "Include related entries",
          default: false
        }
      },
      required: ["id"]
    }
  },
  
  {
    name: "unikortex_list_projects",
    description: "List all projects in the knowledge base.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  
  {
    name: "unikortex_update_status",
    description: "Update the status of an entry (e.g., mark as superseded).",
    inputSchema: {
      type: "object", 
      properties: {
        id: {
          type: "string",
          description: "Entry ID to update"
        },
        status: {
          type: "string",
          enum: ["draft", "active", "superseded", "archived"]
        },
        supersededBy: {
          type: "string",
          description: "ID of entry that supersedes this one (when status=superseded)"
        }
      },
      required: ["id", "status"]
    }
  }
];
```

### 10.3 MCP Tool Response Format

```typescript
// Search response formatted for LLM context
interface SearchToolResponse {
  results: Array<{
    id: string;
    title: string;
    project: string;
    type: string;
    status: string;
    relevanceScore: number;
    summary: string;
    contentPreview: string;  // First 500 chars
    tags: string[];
    createdAt: string;
  }>;
  totalFound: number;
  searchQuery: string;
}

// Save response
interface SaveToolResponse {
  success: true;
  id: string;
  title: string;
  project: string;
  message: string;  // "Saved 'Auth Decision' to project 'mobile-app'"
}
```

---

## 11. Embedding Strategy

### 11.1 Provider Abstraction

```typescript
interface EmbeddingProvider {
  name: string;
  dimensions: number;
  
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  
  // Provider capabilities
  maxBatchSize: number;
  maxInputTokens: number;
  supportsInstructions: boolean;  // e.g., "search_document:" prefix
}

class EmbeddingService {
  private provider: EmbeddingProvider;
  
  constructor(config: EmbeddingConfig) {
    this.provider = this.initializeProvider(config);
  }
  
  private initializeProvider(config: EmbeddingConfig): EmbeddingProvider {
    // Priority order for "auto" mode:
    // 1. OpenAI (if OPENAI_API_KEY set)
    // 2. Ollama (if running locally)
    // 3. Transformers.js (always available)
    
    if (config.provider === 'auto') {
      if (process.env.OPENAI_API_KEY) {
        return new OpenAIEmbeddingProvider(config.openai);
      }
      if (await this.checkOllamaAvailable()) {
        return new OllamaEmbeddingProvider(config.ollama);
      }
      return new TransformersJsProvider(config.local);
    }
    
    // Explicit provider selection
    switch (config.provider) {
      case 'openai': return new OpenAIEmbeddingProvider(config.openai);
      case 'ollama': return new OllamaEmbeddingProvider(config.ollama);
      case 'local': return new TransformersJsProvider(config.local);
    }
  }
}
```

### 11.2 Provider Implementations

**TransformersJS (Local, No Setup)**

```typescript
class TransformersJsProvider implements EmbeddingProvider {
  name = 'transformers.js';
  dimensions = 384;  // all-MiniLM-L6-v2
  maxBatchSize = 32;
  maxInputTokens = 512;
  supportsInstructions = false;
  
  private pipeline: any;
  private modelId = 'Xenova/all-MiniLM-L6-v2';
  
  async initialize(): Promise<void> {
    const { pipeline } = await import('@xenova/transformers');
    this.pipeline = await pipeline('feature-extraction', this.modelId);
  }
  
  async embed(text: string): Promise<Float32Array> {
    const result = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true
    });
    return new Float32Array(result.data);
  }
  
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Process in batches to avoid memory issues
    const results: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, i + this.maxBatchSize);
      const embeddings = await Promise.all(batch.map(t => this.embed(t)));
      results.push(...embeddings);
    }
    return results;
  }
}
```

**Ollama Provider**

```typescript
class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = 'ollama';
  dimensions = 768;  // nomic-embed-text
  maxBatchSize = 64;
  maxInputTokens = 8192;
  supportsInstructions = true;
  
  private baseUrl: string;
  private model: string;
  
  constructor(config: OllamaConfig) {
    this.baseUrl = config.host || 'http://localhost:11434';
    this.model = config.model || 'nomic-embed-text';
  }
  
  async embed(text: string): Promise<Float32Array> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text
      })
    });
    
    const data = await response.json();
    return new Float32Array(data.embedding);
  }
  
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Ollama doesn't support native batching, parallelize
    return Promise.all(texts.map(t => this.embed(t)));
  }
}
```

**OpenAI Provider**

```typescript
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions: number;
  maxBatchSize = 2048;
  maxInputTokens = 8191;
  supportsInstructions = false;
  
  private client: OpenAI;
  private model: string;
  
  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey || process.env.OPENAI_API_KEY });
    this.model = config.model || 'text-embedding-3-small';
    this.dimensions = config.dimensions || 512;  // Reduced for efficiency
  }
  
  async embed(text: string): Promise<Float32Array> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions
    });
    return new Float32Array(response.data[0].embedding);
  }
  
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions
    });
    return response.data.map(d => new Float32Array(d.embedding));
  }
}
```

### 11.3 Embedding Configuration

```yaml
# ~/.unikortex/config.yaml

embeddings:
  provider: auto  # auto | local | ollama | openai
  
  # Provider-specific config
  local:
    model: "Xenova/all-MiniLM-L6-v2"
  
  ollama:
    host: "http://localhost:11434"
    model: "nomic-embed-text"
  
  openai:
    model: "text-embedding-3-small"
    dimensions: 512  # Reduced from 1536 for storage efficiency
    # apiKey read from OPENAI_API_KEY env var
  
  # Embedding generation settings
  batch_size: 32
  auto_embed: true  # Embed on entry creation
  reembed_on_update: true
```

### 11.4 What Gets Embedded

```typescript
function prepareTextForEmbedding(entry: Entry): string {
  // Combine title and context summary for embedding
  // This creates a focused embedding that captures the essence
  
  const parts: string[] = [
    entry.title,
    entry.contextSummary || extractFirstParagraph(entry.content),
    entry.tags.join(' ')
  ];
  
  return parts.filter(Boolean).join('\n\n');
}

// Context summary is either:
// 1. Provided by user when creating entry
// 2. Auto-generated from first meaningful paragraph
// 3. For decisions: extracted "Decision" section
// 4. For research: extracted "Summary" or "Conclusion" section
```

---

## 12. Storage Format

### 12.1 Markdown File Format

Each entry is also stored as a Markdown file for human readability and Obsidian compatibility.

**File location**: `~/.unikortex/vault/{project}/{slugified-title}.md`

**Format**:

```markdown
---
id: unikortex_7x8f2m9p3q1w
title: JWT Authentication Architecture
type: decision
status: active
project: mobile-app
tags:
  - auth
  - security
  - jwt
author: ruslan
contextSummary: JWT-based auth with refresh tokens for mobile app
supersedes: null
related:
  - unikortex_2a3b4c5d6e7f
  - unikortex_9z8y7x6w5v4u
createdAt: 2024-11-15T10:30:00Z
updatedAt: 2024-11-20T14:00:00Z
version: 3
---

## Decision

Use JWT tokens with refresh token rotation for the mobile app authentication.

## Context

We need stateless auth that works across API servers without session storage.
Mobile clients need to maintain sessions for extended periods.

## Details

- Access tokens: 15 min expiry, stored in memory
- Refresh tokens: 7 days, stored in httpOnly secure cookies  
- Token rotation on each refresh to detect token theft

## Alternatives Considered

1. **Session-based auth** - Rejected: requires sticky sessions or shared session store
2. **OAuth with third-party** - Deferred: adds complexity, consider for v2

## Consequences

- Need to implement token refresh logic in mobile clients
- Must handle concurrent refresh race conditions
```

### 12.2 Vault Directory Structure

```
~/.unikortex/
├── config.yaml
├── unikortex.db                    # SQLite database
└── vault/                   # Markdown files
    ├── mobile-app/
    │   ├── jwt-auth-architecture.md
    │   ├── api-rate-limiting.md
    │   └── offline-sync-strategy.md
    ├── backend/
    │   ├── database-selection.md
    │   └── caching-strategy.md
    └── research/
        ├── llm-comparison-2024.md
        └── rag-frameworks-analysis.md
```

### 12.3 Sync Between DB and Vault

```typescript
interface VaultSyncService {
  // DB is source of truth, vault is derived
  
  // On entry create/update: write to vault
  syncEntryToVault(entry: Entry): Promise<void>;
  
  // On entry delete: remove from vault
  removeFromVault(entryId: string): Promise<void>;
  
  // Full sync (for recovery/init)
  syncAllToVault(): Promise<void>;
  
  // Import from external vault (e.g., existing Obsidian)
  importFromVault(vaultPath: string): Promise<ImportResult>;
}
```

---

## 13. Search and Retrieval

### 13.1 Hybrid Search Algorithm

```typescript
interface SearchOptions {
  query: string;
  mode: 'hybrid' | 'semantic' | 'keyword';
  filters: {
    project?: string;
    type?: EntryType[];
    status?: EntryStatus[];
    tags?: string[];
    dateRange?: { from?: Date; to?: Date };
  };
  limit: number;
  offset: number;
}

interface SearchResult {
  entry: Entry;
  score: number;
  scoreBreakdown: {
    semantic: number;
    keyword: number;
  };
  highlights: Highlight[];
}

class HybridSearchEngine {
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, mode, filters, limit } = options;
    
    // 1. Apply filters to get candidate set
    const candidates = await this.applyCandidateFilters(filters);
    
    if (mode === 'keyword') {
      return this.keywordSearch(query, candidates, limit);
    }
    
    if (mode === 'semantic') {
      return this.semanticSearch(query, candidates, limit);
    }
    
    // Hybrid mode: combine both
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query, candidates, limit * 2),
      this.keywordSearch(query, candidates, limit * 2)
    ]);
    
    return this.mergeResults(semanticResults, keywordResults, limit);
  }
  
  private async semanticSearch(
    query: string, 
    candidates: Entry[], 
    limit: number
  ): Promise<SearchResult[]> {
    // 1. Embed query
    const queryEmbedding = await this.embeddingService.embed(query);
    
    // 2. Vector similarity search
    // SQLite: uses sqlite-vec
    // PostgreSQL: uses pgvector with IVFFlat index
    const results = await this.vectorSearch(queryEmbedding, candidates, limit);
    
    return results.map(r => ({
      entry: r.entry,
      score: r.similarity,
      scoreBreakdown: { semantic: r.similarity, keyword: 0 },
      highlights: []
    }));
  }
  
  private async keywordSearch(
    query: string,
    candidates: Entry[],
    limit: number
  ): Promise<SearchResult[]> {
    // SQLite: FTS5 with BM25 ranking
    // PostgreSQL: ts_rank with GIN index
    const results = await this.ftsSearch(query, candidates, limit);
    
    return results.map(r => ({
      entry: r.entry,
      score: r.rank,
      scoreBreakdown: { semantic: 0, keyword: r.rank },
      highlights: r.highlights
    }));
  }
  
  private mergeResults(
    semantic: SearchResult[],
    keyword: SearchResult[],
    limit: number
  ): SearchResult[] {
    // Reciprocal Rank Fusion (RRF)
    const k = 60;  // RRF constant
    const scores = new Map<string, { entry: Entry; score: number; breakdown: any }>();
    
    semantic.forEach((result, rank) => {
      const rrf = 1 / (k + rank + 1);
      scores.set(result.entry.id, {
        entry: result.entry,
        score: rrf,
        breakdown: { semantic: result.score, keyword: 0 }
      });
    });
    
    keyword.forEach((result, rank) => {
      const rrf = 1 / (k + rank + 1);
      const existing = scores.get(result.entry.id);
      if (existing) {
        existing.score += rrf;
        existing.breakdown.keyword = result.score;
      } else {
        scores.set(result.entry.id, {
          entry: result.entry,
          score: rrf,
          breakdown: { semantic: 0, keyword: result.score }
        });
      }
    });
    
    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({
        entry: s.entry,
        score: s.score,
        scoreBreakdown: s.breakdown,
        highlights: []
      }));
  }
}
```

### 13.2 Context Retrieval for LLM

```typescript
interface ContextOptions {
  query: string;
  project?: string;
  maxTokens: number;
  format: 'xml' | 'markdown' | 'json';
  includeRelated: boolean;
  prioritize: 'relevance' | 'recency' | 'hybrid';
}

class ContextRetriever {
  async getContext(options: ContextOptions): Promise<FormattedContext> {
    // 1. Search for relevant entries
    const results = await this.searchEngine.search({
      query: options.query,
      filters: { project: options.project, status: ['active'] },
      mode: 'hybrid',
      limit: 20  // Fetch more than needed for token budgeting
    });
    
    // 2. Optionally fetch related entries
    let allEntries = results.map(r => r.entry);
    if (options.includeRelated) {
      const relatedIds = new Set<string>();
      for (const entry of allEntries) {
        const relations = await this.getRelations(entry.id);
        relations.forEach(r => relatedIds.add(r.toId));
      }
      const relatedEntries = await this.getEntriesByIds([...relatedIds]);
      allEntries = [...allEntries, ...relatedEntries];
    }
    
    // 3. Budget tokens and truncate
    const budgeted = this.budgetTokens(allEntries, options.maxTokens);
    
    // 4. Format for LLM
    return this.formatContext(budgeted, options.format);
  }
  
  private budgetTokens(entries: Entry[], maxTokens: number): TruncatedEntry[] {
    const tokenizer = new Tokenizer();  // tiktoken or similar
    const result: TruncatedEntry[] = [];
    let usedTokens = 0;
    
    // Reserve tokens for structure (XML tags, etc.)
    const structureOverhead = 100;
    const availableTokens = maxTokens - structureOverhead;
    
    for (const entry of entries) {
      const metadata = this.formatMetadata(entry);
      const metadataTokens = tokenizer.count(metadata);
      
      if (usedTokens + metadataTokens > availableTokens) break;
      
      const remainingBudget = Math.min(
        500,  // Max tokens per entry content
        availableTokens - usedTokens - metadataTokens
      );
      
      const truncatedContent = this.truncateContent(entry.content, remainingBudget);
      const contentTokens = tokenizer.count(truncatedContent);
      
      result.push({
        ...entry,
        content: truncatedContent,
        truncated: truncatedContent !== entry.content
      });
      
      usedTokens += metadataTokens + contentTokens;
    }
    
    return result;
  }
  
  private formatContext(entries: TruncatedEntry[], format: string): string {
    if (format === 'xml') {
      return this.formatAsXml(entries);
    }
    // ... other formats
  }
  
  private formatAsXml(entries: TruncatedEntry[]): string {
    const parts = entries.map(entry => `
  <entry id="${entry.id}" type="${entry.type}" status="${entry.status}" project="${entry.projectId}">
    <title>${escapeXml(entry.title)}</title>
    <summary>${escapeXml(entry.contextSummary || '')}</summary>
    <created>${entry.createdAt.toISOString()}</created>
    <tags>${entry.tags.join(', ')}</tags>
    <content${entry.truncated ? ' truncated="true"' : ''}>
${escapeXml(entry.content)}
    </content>
  </entry>`);
    
    return `<knowledge_entries count="${entries.length}">
${parts.join('\n')}
</knowledge_entries>`;
  }
}
```

---

## 14. Team Features

### 14.1 Permission Model

```typescript
// Organization level
type OrgPermission = 
  | 'org:manage'        // Update org settings, billing
  | 'org:members'       // Manage members
  | 'org:workspaces'    // Create/delete workspaces
  | 'org:read';         // View org details

// Workspace level  
type WorkspacePermission =
  | 'workspace:manage'  // Update workspace settings
  | 'workspace:members' // Manage workspace members
  | 'workspace:projects'// Create/delete projects
  | 'workspace:read';   // View workspace

// Project level (inherited from workspace role)
type ProjectPermission =
  | 'project:manage'    // Update project settings
  | 'project:write'     // Create/edit entries
  | 'project:read';     // View entries

// Role to permission mapping
const rolePermissions = {
  org: {
    owner: ['org:manage', 'org:members', 'org:workspaces', 'org:read'],
    admin: ['org:members', 'org:workspaces', 'org:read'],
    member: ['org:read']
  },
  workspace: {
    admin: ['workspace:manage', 'workspace:members', 'workspace:projects', 'workspace:read', 'project:manage', 'project:write', 'project:read'],
    editor: ['workspace:read', 'project:write', 'project:read'],
    viewer: ['workspace:read', 'project:read']
  }
};
```

### 14.2 Sync Protocol

```typescript
// Offline-first sync with optimistic updates

interface SyncProtocol {
  // Client tracks local version
  localVersion: number;
  
  // On user action
  async createEntry(entry: EntryInput): Promise<Entry> {
    // 1. Optimistically save locally with temp ID
    const tempId = generateTempId();
    const localEntry = await this.localStore.create({ ...entry, id: tempId });
    
    // 2. Queue for sync
    await this.syncQueue.push({
      action: 'create',
      tempId,
      data: entry
    });
    
    // 3. Attempt sync if online
    if (this.isOnline) {
      this.triggerSync();
    }
    
    return localEntry;
  }
  
  // Background sync process
  async sync(): Promise<SyncResult> {
    // 1. Push pending changes
    const pending = await this.syncQueue.getAll();
    const pushResult = await this.api.pushChanges(pending, this.localVersion);
    
    // Handle conflicts
    for (const conflict of pushResult.conflicts) {
      await this.handleConflict(conflict);
    }
    
    // Update temp IDs to real IDs
    for (const mapping of pushResult.idMappings) {
      await this.localStore.updateId(mapping.tempId, mapping.realId);
    }
    
    // 2. Pull remote changes
    const changes = await this.api.getChanges(this.localVersion);
    
    for (const change of changes) {
      await this.applyRemoteChange(change);
    }
    
    // 3. Update local version
    this.localVersion = pushResult.newVersion;
    
    return { pushed: pending.length, pulled: changes.length };
  }
  
  async handleConflict(conflict: Conflict): Promise<void> {
    // Default strategy: last-write-wins based on timestamp
    // Can be configured to prompt user
    
    switch (this.config.conflictResolution) {
      case 'local-wins':
        // Force push local version
        await this.api.forceUpdate(conflict.entryId, conflict.localData);
        break;
      case 'remote-wins':
        // Apply remote version locally
        await this.localStore.update(conflict.entryId, conflict.remoteData);
        break;
      case 'manual':
        // Mark as conflicted, user resolves via CLI
        await this.markConflicted(conflict);
        break;
    }
  }
}
```

### 14.3 Team Server Deployment

```yaml
# docker-compose.yaml for self-hosted team server

version: '3.8'

services:
  unikortex-server:
    image: ghcr.io/anthropic-community/unikortex-server:latest
    ports:
      - "3033:3033"
    environment:
      - DATABASE_URL=postgresql://unikortex:password@postgres:5432/unikortex
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - EMBEDDINGS_PROVIDER=openai
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=unikortex
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=unikortex
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

---

## 15. Security

### 15.1 Personal Mode Security

- **Local only**: Server binds to `127.0.0.1` by default
- **File permissions**: Database and vault have `600` permissions
- **No telemetry**: Zero data sent externally unless explicitly configured

### 15.2 Team Mode Security

```typescript
// API Key format and validation
interface ApiKey {
  prefix: 'unikortex_live' | 'unikortex_test';
  organizationId: string;
  userId: string;
  permissions: string[];
  expiresAt?: Date;
}

// Key generation
function generateApiKey(): { key: string; hash: string } {
  const key = `unikortex_live_${crypto.randomBytes(32).toString('base64url')}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, hash };  // Store only hash in DB
}

// Request authentication
async function authenticateRequest(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing API key');
  }
  
  const key = authHeader.slice(7);
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  
  const apiKey = await db.apiKeys.findByHash(hash);
  if (!apiKey || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
    throw new UnauthorizedError('Invalid or expired API key');
  }
  
  // Update last used
  await db.apiKeys.updateLastUsed(apiKey.id);
  
  return {
    userId: apiKey.userId,
    organizationId: apiKey.organizationId,
    permissions: apiKey.permissions
  };
}
```

### 15.3 Data Protection

- **At rest**: SQLite encryption available via SQLCipher (optional)
- **In transit**: HTTPS required for team mode
- **Embeddings**: Stored locally; API embeddings cached to reduce external calls
- **Audit log**: All modifications logged with user ID and timestamp

---

## 16. Implementation Phases

### Phase 1: Core Foundation (Weeks 1-2)

**Goal**: Working CLI with local storage

**Deliverables**:
- [ ] Project scaffolding (monorepo with pnpm)
- [ ] Core types and interfaces
- [ ] SQLite store implementation
- [ ] Entry CRUD operations
- [ ] Project management
- [ ] Basic CLI commands: `init`, `add`, `list`, `show`, `delete`
- [ ] Markdown vault sync
- [ ] Unit tests for core logic

**Success criteria**: Can add and list entries via CLI

### Phase 2: Search & Embeddings (Weeks 3-4)

**Goal**: Hybrid search working

**Deliverables**:
- [ ] Embedding provider abstraction
- [ ] TransformersJS local embeddings
- [ ] Ollama provider
- [ ] OpenAI provider
- [ ] sqlite-vec integration
- [ ] FTS5 full-text search
- [ ] Hybrid search algorithm
- [ ] CLI `search` command
- [ ] Context retrieval with token budgeting

**Success criteria**: Can semantically search entries

### Phase 3: MCP Integration (Week 5)

**Goal**: Works with Claude Desktop/Code

**Deliverables**:
- [ ] MCP server implementation (stdio transport)
- [ ] Tool definitions: `unikortex_save`, `unikortex_search`, `unikortex_get`, `unikortex_list_projects`
- [ ] `unikortex mcp` command
- [ ] `unikortex mcp-config` output
- [ ] Integration tests with Claude Desktop

**Success criteria**: Can save and query from Claude Desktop

### Phase 4: Team Server (Weeks 6-7)

**Goal**: Multi-user support

**Deliverables**:
- [ ] Fastify REST API server
- [ ] PostgreSQL + pgvector store
- [ ] API key authentication
- [ ] User and organization management
- [ ] Workspace and project permissions
- [ ] MCP HTTP transport
- [ ] Docker Compose setup

**Success criteria**: Team can share knowledge base

### Phase 5: Sync & GPT Integration (Weeks 8-9)

**Goal**: Offline-first sync, ChatGPT support

**Deliverables**:
- [ ] Sync protocol implementation
- [ ] Conflict detection and resolution
- [ ] CLI `sync` commands
- [ ] OpenAPI spec generation for GPT Actions
- [ ] Custom GPT instructions template
- [ ] `unikortex gpt-spec` command

**Success criteria**: Works offline, syncs when connected; works with ChatGPT

### Phase 6: Polish & Release (Week 10)

**Goal**: Production-ready v1.0

**Deliverables**:
- [ ] Comprehensive documentation
- [ ] README with quick start
- [ ] npm package publishing
- [ ] Homebrew formula
- [ ] Docker Hub images
- [ ] GitHub Actions CI/CD
- [ ] Example configurations
- [ ] Video walkthrough

**Success criteria**: Anyone can install and use in <5 minutes

---

## 17. Project Structure

```
unikortex/
├── .github/
│   └── workflows/
│       ├── ci.yaml
│       ├── release.yaml
│       └── docker.yaml
├── packages/
│   ├── core/                        # Shared business logic
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts             # All TypeScript interfaces
│   │   │   ├── entry/
│   │   │   │   ├── entry.ts         # Entry class and validation
│   │   │   │   ├── entry.test.ts
│   │   │   │   └── relations.ts
│   │   │   ├── project/
│   │   │   │   └── project.ts
│   │   │   ├── search/
│   │   │   │   ├── engine.ts        # Hybrid search
│   │   │   │   ├── context.ts       # LLM context retrieval
│   │   │   │   └── engine.test.ts
│   │   │   ├── embedding/
│   │   │   │   ├── provider.ts      # Abstract interface
│   │   │   │   ├── transformers.ts  # Local embeddings
│   │   │   │   ├── ollama.ts
│   │   │   │   ├── openai.ts
│   │   │   │   └── service.ts       # Provider selection
│   │   │   ├── storage/
│   │   │   │   ├── interface.ts     # Storage abstraction
│   │   │   │   ├── sqlite.ts        # SQLite implementation
│   │   │   │   └── postgres.ts      # PostgreSQL implementation
│   │   │   ├── sync/
│   │   │   │   ├── protocol.ts
│   │   │   │   ├── conflict.ts
│   │   │   │   └── queue.ts
│   │   │   ├── vault/
│   │   │   │   ├── markdown.ts      # MD parsing/generation
│   │   │   │   └── sync.ts          # Vault sync logic
│   │   │   └── utils/
│   │   │       ├── id.ts            # ID generation
│   │   │       ├── slug.ts          # URL-safe slugs
│   │   │       └── tokens.ts        # Token counting
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                         # Command-line interface
│   │   ├── src/
│   │   │   ├── index.ts             # Entry point
│   │   │   ├── commands/
│   │   │   │   ├── init.ts
│   │   │   │   ├── add.ts
│   │   │   │   ├── search.ts
│   │   │   │   ├── list.ts
│   │   │   │   ├── show.ts
│   │   │   │   ├── edit.ts
│   │   │   │   ├── delete.ts
│   │   │   │   ├── projects.ts
│   │   │   │   ├── serve.ts
│   │   │   │   ├── sync.ts
│   │   │   │   ├── mcp.ts
│   │   │   │   ├── mcp-config.ts
│   │   │   │   ├── gpt-spec.ts
│   │   │   │   ├── export.ts
│   │   │   │   ├── import.ts
│   │   │   │   └── config.ts
│   │   │   ├── config/
│   │   │   │   ├── loader.ts        # Config file handling
│   │   │   │   └── defaults.ts
│   │   │   ├── output/
│   │   │   │   ├── table.ts         # Table formatting
│   │   │   │   ├── json.ts
│   │   │   │   └── colors.ts
│   │   │   └── client/
│   │   │       └── remote.ts        # API client for team mode
│   │   ├── bin/
│   │   │   └── unikortex.js                # Executable entry
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── server/                      # Team server
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── app.ts               # Fastify app setup
│   │   │   ├── routes/
│   │   │   │   ├── entries.ts
│   │   │   │   ├── search.ts
│   │   │   │   ├── projects.ts
│   │   │   │   ├── sync.ts
│   │   │   │   ├── users.ts
│   │   │   │   └── health.ts
│   │   │   ├── mcp/
│   │   │   │   └── handler.ts       # MCP over HTTP
│   │   │   ├── auth/
│   │   │   │   ├── apikey.ts
│   │   │   │   ├── oidc.ts
│   │   │   │   └── middleware.ts
│   │   │   ├── db/
│   │   │   │   ├── client.ts
│   │   │   │   └── migrations/
│   │   │   └── queue/
│   │   │       └── embeddings.ts    # Background embedding jobs
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mcp-stdio/                   # Standalone MCP server
│       ├── src/
│       │   └── index.ts             # Thin wrapper around core
│       ├── package.json
│       └── tsconfig.json
│
├── docker/
│   ├── docker-compose.yaml          # Full stack
│   ├── docker-compose.dev.yaml      # Development
│   └── Dockerfile.cli               # CLI-only image
│
├── docs/
│   ├── getting-started.md
│   ├── cli-reference.md
│   ├── api-reference.md
│   ├── mcp-integration.md
│   ├── chatgpt-integration.md
│   ├── team-setup.md
│   └── architecture.md
│
├── examples/
│   ├── claude-desktop-config.json
│   ├── custom-gpt-instructions.md
│   └── sample-entries/
│
├── scripts/
│   ├── build.sh
│   ├── release.sh
│   └── generate-openapi.ts
│
├── package.json                     # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
├── LICENSE                          # MIT
└── README.md
```

---

## 18. Technology Stack

### 18.1 Runtime & Language

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Language | TypeScript 5.x | Type safety, broad ecosystem |
| Runtime | Node.js 20+ | LTS, native ESM, performance |
| Package Manager | pnpm | Fast, disk-efficient monorepo support |

### 18.2 Core Dependencies

```json
{
  "dependencies": {
    // CLI
    "commander": "^12.0.0",          // CLI framework
    "inquirer": "^9.0.0",            // Interactive prompts
    "chalk": "^5.0.0",               // Terminal colors
    "ora": "^8.0.0",                 // Spinners
    "cli-table3": "^0.6.0",          // Table output
    
    // Storage
    "better-sqlite3": "^11.0.0",     // SQLite driver
    "sqlite-vec": "^0.1.0",          // Vector extension
    "pg": "^8.0.0",                  // PostgreSQL driver
    "pgvector": "^0.1.0",            // pgvector support
    
    // Server
    "fastify": "^5.0.0",             // HTTP framework
    "@fastify/cors": "^9.0.0",
    "@fastify/rate-limit": "^9.0.0",
    
    // MCP
    "@modelcontextprotocol/sdk": "^1.0.0",
    
    // Embeddings
    "@xenova/transformers": "^3.0.0", // Local embeddings
    "openai": "^4.0.0",              // OpenAI API
    
    // Utilities
    "nanoid": "^5.0.0",              // ID generation
    "yaml": "^2.0.0",                // Config parsing
    "zod": "^3.0.0",                 // Schema validation
    "gray-matter": "^4.0.0",         // Markdown frontmatter
    "marked": "^12.0.0",             // Markdown parsing
    "tiktoken": "^1.0.0",            // Token counting
    "date-fns": "^3.0.0"             // Date handling
  },
  "devDependencies": {
    "vitest": "^2.0.0",              // Testing
    "tsx": "^4.0.0",                 // TypeScript execution
    "tsup": "^8.0.0",                // Building
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.0.0"
  }
}
```

### 18.3 Database Versions

- **SQLite**: 3.45+ (for FTS5 and JSON functions)
- **PostgreSQL**: 15+ (for pgvector 0.5+)
- **Redis**: 7+ (for team mode caching)

---

## 19. Testing Strategy

### 19.1 Test Categories

| Category | Tool | Coverage Target |
|----------|------|-----------------|
| Unit | Vitest | 80%+ for core |
| Integration | Vitest | Storage, search, sync |
| E2E | Vitest + CLI | Full user workflows |
| MCP | Mock client | Tool invocations |

### 19.2 Test Examples

```typescript
// packages/core/src/entry/entry.test.ts
import { describe, it, expect } from 'vitest';
import { validateEntry, createEntry } from './entry';

describe('Entry', () => {
  describe('validation', () => {
    it('accepts valid entry', () => {
      const input = {
        title: 'Test Entry',
        content: 'Some content',
        type: 'decision',
        projectId: 'proj_123'
      };
      expect(() => validateEntry(input)).not.toThrow();
    });
    
    it('rejects empty title', () => {
      const input = { title: '', content: 'x', type: 'decision', projectId: 'proj_123' };
      expect(() => validateEntry(input)).toThrow('Title is required');
    });
    
    it('rejects invalid type', () => {
      const input = { title: 'x', content: 'x', type: 'invalid', projectId: 'proj_123' };
      expect(() => validateEntry(input)).toThrow('Invalid entry type');
    });
  });
  
  describe('creation', () => {
    it('generates ID with correct prefix', () => {
      const entry = createEntry({ title: 'Test', content: 'x', type: 'note', projectId: 'p' });
      expect(entry.id).toMatch(/^unikortex_[a-zA-Z0-9]{12}$/);
    });
    
    it('sets default status to active', () => {
      const entry = createEntry({ title: 'Test', content: 'x', type: 'note', projectId: 'p' });
      expect(entry.status).toBe('active');
    });
  });
});

// packages/core/src/search/engine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { HybridSearchEngine } from './engine';
import { createTestStore } from '../testing/fixtures';

describe('HybridSearchEngine', () => {
  let engine: HybridSearchEngine;
  let store: TestStore;
  
  beforeEach(async () => {
    store = await createTestStore();
    engine = new HybridSearchEngine(store);
    
    // Seed test data
    await store.createEntry({
      title: 'JWT Authentication',
      content: 'Use JWT tokens with refresh rotation',
      type: 'decision',
      tags: ['auth', 'security']
    });
    await store.createEntry({
      title: 'Database Selection',
      content: 'PostgreSQL for relational data',
      type: 'decision',
      tags: ['database']
    });
  });
  
  it('finds entry by semantic similarity', async () => {
    const results = await engine.search({
      query: 'how should we handle user login',
      mode: 'semantic',
      limit: 5
    });
    
    expect(results[0].entry.title).toBe('JWT Authentication');
    expect(results[0].score).toBeGreaterThan(0.7);
  });
  
  it('finds entry by keyword match', async () => {
    const results = await engine.search({
      query: 'PostgreSQL',
      mode: 'keyword',
      limit: 5
    });
    
    expect(results[0].entry.title).toBe('Database Selection');
  });
  
  it('combines results in hybrid mode', async () => {
    const results = await engine.search({
      query: 'authentication tokens',
      mode: 'hybrid',
      limit: 5
    });
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].scoreBreakdown.semantic).toBeGreaterThan(0);
    expect(results[0].scoreBreakdown.keyword).toBeGreaterThan(0);
  });
});
```

### 19.3 CI Pipeline

```yaml
# .github/workflows/ci.yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test
      - run: pnpm lint
      - run: pnpm build
      
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/postgres
```

---

## 20. Deployment

### 20.1 npm Package

```bash
# Publishing
pnpm build
pnpm publish --access public
```

**Package names**:
- `@anthropic-community/unikortex` - CLI
- `@anthropic-community/unikortex-core` - Core library
- `@anthropic-community/unikortex-server` - Team server

### 20.2 Homebrew

```ruby
# Formula: unikortex.rb
class Kb < Formula
  desc "Knowledge base CLI for AI workflows"
  homepage "https://github.com/anthropic-community/unikortex"
  url "https://github.com/anthropic-community/unikortex/releases/download/v1.0.0/unikortex-darwin-arm64.tar.gz"
  sha256 "..."
  license "MIT"

  def install
    bin.install "unikortex"
  end

  test do
    system "#{bin}/unikortex", "--version"
  end
end
```

### 20.3 Docker

```dockerfile
# Dockerfile.cli
FROM node:20-alpine
RUN npm install -g @anthropic-community/unikortex
ENTRYPOINT ["unikortex"]

# Usage
docker run -v ~/.unikortex:/root/.unikortex ghcr.io/anthropic-community/unikortex search "auth"
```

### 20.4 Self-Hosted Team Server

```bash
# One-command deploy
curl -sSL https://unikortex.dev/install-server.sh | bash

# Or with docker-compose
git clone https://github.com/anthropic-community/unikortex
cd unikortex/docker
cp .env.example .env
# Edit .env with your settings
docker-compose up -d
```

---

## 21. Success Metrics

### 21.1 Adoption Metrics

| Metric | Target (6 months) |
|--------|-------------------|
| npm weekly downloads | 1,000+ |
| GitHub stars | 500+ |
| Active team deployments | 50+ |

### 21.2 Usage Metrics

| Metric | Target |
|--------|--------|
| Avg entries per user | 50+ |
| Search queries per user per week | 10+ |
| MCP tool invocations per session | 3+ |

### 21.3 Quality Metrics

| Metric | Target |
|--------|--------|
| Search relevance (top-3 accuracy) | 85%+ |
| CLI command success rate | 99%+ |
| Sync conflict rate | <1% |
| Time to first entry (new user) | <2 min |

---

## Appendix A: Configuration Reference

```yaml
# ~/.unikortex/config.yaml - Complete reference

# Mode: personal (local only) or team (with server)
mode: personal  # personal | team

# Team server configuration (only used when mode=team)
server:
  url: "https://unikortex.example.com"
  # API key read from UNIKORTEX_API_KEY environment variable

# Authentication (team mode)
auth:
  method: api_key  # api_key | oidc
  oidc:
    issuer: "https://auth.example.com"
    clientId: "unikortex-cli"

# Embedding configuration
embeddings:
  provider: auto  # auto | local | ollama | openai
  
  local:
    model: "Xenova/all-MiniLM-L6-v2"
  
  ollama:
    host: "http://localhost:11434"
    model: "nomic-embed-text"
  
  openai:
    model: "text-embedding-3-small"
    dimensions: 512

# Search configuration  
search:
  defaultMode: hybrid  # hybrid | semantic | keyword
  defaultLimit: 10
  hybridWeights:
    semantic: 0.7
    keyword: 0.3

# Sync configuration (team mode)
sync:
  autoSync: true
  intervalSeconds: 300  # 5 minutes
  conflictResolution: local-wins  # local-wins | remote-wins | manual

# Vault configuration
vault:
  enabled: true
  path: "~/.unikortex/vault"
  syncOnChange: true

# Server configuration (for unikortex serve)
serve:
  host: "127.0.0.1"
  port: 3033
  enableMcp: true
  enableRest: true

# Output preferences
output:
  defaultFormat: table  # table | json | minimal
  colors: true
  timestamps: relative  # relative | absolute | iso
```

---

## Appendix B: Example Prompts for AI Integration

### Claude Desktop/Code System Prompt Addition

```
You have access to UniKortex, a knowledge base for storing and retrieving information across our conversations.

When to use UniKortex:
- When I ask you to "save", "remember", or "store" something important
- When I ask about past decisions, research, or artifacts
- When I reference "what we decided" or "what we discussed before"

Tools available:
- unikortex_save: Save new entries with title, content, project, type, and tags
- unikortex_search: Search for relevant past entries
- unikortex_get: Retrieve a specific entry by ID
- unikortex_list_projects: See all available projects

Always confirm after saving and provide the entry ID for future reference.
```

### Custom GPT Instructions

```
You are an AI assistant with access to the user's personal knowledge base via API actions.

When the user mentions past decisions, research, or wants to save information:
1. Use the search action to find relevant existing entries
2. Use the create action to save new information
3. Always organize content into appropriate projects and add relevant tags

Format entries clearly with:
- Descriptive titles
- Structured content (use ## headers for sections)
- Appropriate type (decision/research/artifact/note/reference)
- Relevant tags for discoverability
```

---

*End of PRD*
