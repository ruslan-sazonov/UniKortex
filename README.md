# UniKortex

[![npm version](https://img.shields.io/npm/v/@unikortex/cli.svg)](https://www.npmjs.com/package/@unikortex/cli)
[![CI](https://github.com/ruslan-sazonov/UniKortex/actions/workflows/ci.yml/badge.svg)](https://github.com/ruslan-sazonov/UniKortex/actions/workflows/ci.yml)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

**Unified Knowledge Base for AI Workflows**

UniKortex is a persistent knowledge management system designed for AI-assisted development. It captures decisions, research, and artifacts from your AI conversations, making them searchable and reusable across sessions and projects.

## Why UniKortex?

When working with AI assistants like Claude, ChatGPT, or Gemini, valuable context gets lost between sessions:
- Architectural decisions and their rationale
- Research findings and technology comparisons
- Code patterns and configurations
- Project-specific context

UniKortex solves this by providing a persistent knowledge base that AI assistants can read from and write to, ensuring continuity across conversations.

## Features

- **Persistent Knowledge Storage** - SQLite-based storage with full-text search
- **Semantic Search** - Vector embeddings for intelligent context retrieval
- **Project Scoping** - Organize knowledge by project with automatic context filtering
- **MCP Integration** - Native support for Claude Desktop, Claude Code, Gemini CLI, and Antigravity
- **REST API** - OpenAPI-compatible server for ChatGPT and custom integrations
- **Obsidian Vault Sync** - Optional sync to Obsidian for markdown-based knowledge management
- **Entry Types** - Categorize as decisions, research, artifacts, notes, or references
- **Relations** - Link related entries with typed relationships

## Installation

### Using npm (recommended)

```bash
npm install -g @unikortex/cli
```

### Using Homebrew (macOS/Linux)

```bash
brew install unikortex/tap/unikortex
```

### From source

```bash
git clone https://github.com/ruslan-sazonov/UniKortex.git
cd UniKortex
pnpm install
pnpm build
npm link -g packages/cli
```

## Quick Start

### 1. Initialize UniKortex

```bash
unikortex init
```

This creates `~/.unikortex/` with your configuration and SQLite database.

### 2. Create a Project

```bash
unikortex projects create my-project --display-name "My Project"
unikortex projects switch my-project
```

### 3. Add Your First Entry

```bash
# Interactive mode
unikortex add

# Or with flags
unikortex add "We decided to use PostgreSQL for the database" \
  --title "Database Selection" \
  --type decision \
  --tags "database,architecture"
```

### 4. Search Your Knowledge

```bash
unikortex search "database decisions"
```

### 5. Connect to AI Assistants

```bash
unikortex mcp-config
```

This shows configuration for all supported AI assistants.

## AI Integration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "unikortex": {
      "command": "unikortex",
      "args": ["mcp"],
      "env": {
        "UNIKORTEX_CONFIG_PATH": "/Users/YOUR_USERNAME/.unikortex/config.yaml"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport stdio unikortex -- npx -y @unikortex/cli mcp
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "unikortex": {
      "command": "npx",
      "args": ["-y", "@unikortex/cli", "mcp"]
    }
  }
}
```

### Google Antigravity

Add to `~/.gemini/antigravity/mcp_config.json`:

```json
{
  "mcpServers": {
    "unikortex": {
      "command": "npx",
      "args": ["-y", "@unikortex/cli", "mcp"]
    }
  }
}
```

### ChatGPT / OpenAI GPTs

Start the local API server:

```bash
unikortex serve --port 3033
```

Then configure your GPT to use `http://localhost:3033` as the API endpoint.

## CLI Commands

### Entry Management

```bash
unikortex add [content]        # Add a new entry
unikortex list                 # List entries
unikortex show <id>            # Show entry details
unikortex edit <id>            # Edit in default editor
unikortex update <id>          # Update metadata
unikortex delete <id>          # Delete an entry
```

### Project Management

```bash
unikortex projects             # List all projects
unikortex projects create      # Create a new project
unikortex projects switch      # Set active project
unikortex projects current     # Show active project
unikortex projects clear       # Clear active project (global scope)
```

### Search & Context

```bash
unikortex search <query>       # Search entries
unikortex context <query>      # Get formatted context for LLMs
unikortex reindex              # Rebuild search index
```

### Relations

```bash
unikortex relate <from> <to>   # Create a relation
unikortex relations <id>       # List relations
unikortex unrelate <from> <to> # Remove a relation
```

### Import/Export

```bash
unikortex export --format markdown --output ./backup
unikortex import ./backup
```

### Servers

```bash
unikortex mcp                  # Run MCP server (for AI integrations)
unikortex serve                # Run REST API server
```

## Configuration

Configuration is stored in `~/.unikortex/config.yaml`:

```yaml
# Database location
database:
  path: ~/.unikortex/unikortex.db

# Embedding provider for semantic search
embeddings:
  provider: local  # local, openai, or ollama
  # For OpenAI:
  # provider: openai
  # apiKey: sk-...
  # model: text-embedding-3-small

# Optional: Sync to Obsidian vault
vault:
  enabled: false
  path: ~/Documents/Obsidian/UniKortex

# Active project for filtering
activeProject: my-project
```

## Entry Types

| Type | Description | Use Case |
|------|-------------|----------|
| `decision` | Architectural and design decisions | "Why did we choose PostgreSQL?" |
| `research` | Findings, comparisons, analysis | "Comparison of auth libraries" |
| `artifact` | Code, configs, templates | "Docker compose template" |
| `note` | General notes and ideas | "Ideas for v2 features" |
| `reference` | External resources and links | "AWS documentation links" |

## Entry Statuses

| Status | Description |
|--------|-------------|
| `draft` | Work in progress |
| `active` | Current and relevant |
| `superseded` | Replaced by newer entry |
| `archived` | No longer relevant |

## MCP Tools Available

When connected via MCP, AI assistants have access to:

| Tool | Description |
|------|-------------|
| `unikortex_save` | Save new entries |
| `unikortex_search` | Search the knowledge base |
| `unikortex_context` | Get formatted context for LLMs |
| `unikortex_get` | Retrieve a specific entry |
| `unikortex_list_projects` | List available projects |
| `unikortex_set_project` | Set active project |
| `unikortex_clear_project` | Clear active project |
| `unikortex_update_status` | Update entry status |

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Setup

```bash
git clone https://github.com/ruslan-sazonov/UniKortex.git
cd UniKortex
pnpm install
pnpm build
```

### Running Tests

```bash
pnpm test
```

### Project Structure

```
packages/
├── core/          # Core library (storage, search, services)
├── cli/           # Command-line interface
└── mcp-stdio/     # MCP server for AI integrations
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

PolyForm Noncommercial License 1.0.0 - see [LICENSE](LICENSE) for details.

**TL;DR:** Free for personal use, research, education, and non-commercial purposes. Commercial use (like building a SaaS on top of it) requires a separate commercial license. Contributions are welcome!

## Acknowledgments

- Built with [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Semantic search powered by [Transformers.js](https://huggingface.co/docs/transformers.js)
- Storage with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
