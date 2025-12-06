# @unikortex/cli

Command-line interface for UniKortex - a unified knowledge base for AI workflows.

## Installation

```bash
npm install -g @unikortex/cli
```

## Quick Start

```bash
# Initialize UniKortex
unikortex init

# Create a project
unikortex projects create my-project

# Add an entry
unikortex add --type decision --title "Use TypeScript" --project my-project

# Search your knowledge
unikortex search "typescript"
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize UniKortex in your home directory |
| `add` | Add a new entry (decision, research, artifact, note, reference) |
| `search` | Search entries using keywords or semantic search |
| `list` | List entries with optional filters |
| `show` | Display a specific entry |
| `edit` | Edit an existing entry |
| `delete` | Delete an entry |
| `projects` | Manage projects (create, list, switch, delete) |
| `context` | Get context for AI assistants |
| `mcp` | Start MCP server for Claude integration |
| `mcp-config` | Show MCP configuration for AI assistants |
| `serve` | Start HTTP server for ChatGPT integration |

## AI Integration

### Claude Desktop
Automatically configured during `unikortex init`, or run:
```bash
unikortex mcp-config --format claude-desktop
```

### Claude Code
```bash
claude mcp add --transport stdio unikortex -- npx -y @unikortex/cli mcp
```

### ChatGPT (Custom GPT)
```bash
unikortex serve  # Start local server
ngrok http 3033  # Expose publicly
# Import OpenAPI spec in ChatGPT: https://your-url.ngrok.io/openapi.json
```

### Gemini CLI
```bash
unikortex mcp-config --format gemini-cli
```

## Documentation

Full documentation: https://github.com/ruslan-sazonov/UniKortex

## License

PolyForm Noncommercial 1.0.0
