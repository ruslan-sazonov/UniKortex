# @unikortex/mcp-stdio

MCP (Model Context Protocol) server for UniKortex - enables AI assistants like Claude to access your knowledge base.

## Installation

```bash
npm install -g @unikortex/cli
```

The MCP server is included with the CLI package.

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

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

Or run `unikortex init` to configure automatically.

## Usage with Claude Code

```bash
claude mcp add --transport stdio unikortex -- npx -y @unikortex/cli mcp
```

## Available Tools

The MCP server exposes these tools to AI assistants:

| Tool | Description |
|------|-------------|
| `search` | Search the knowledge base |
| `get_context` | Get relevant context for a query |
| `list_entries` | List entries with filters |
| `get_entry` | Get a specific entry by ID |
| `create_entry` | Create a new entry |
| `list_projects` | List all projects |

## Available Prompts

| Prompt | Description |
|--------|-------------|
| `recall` | Find relevant past decisions and context |
| `save_decision` | Save an architectural decision |
| `save_research` | Save research findings |

## Standalone Usage

```bash
# Run the MCP server directly
npx @unikortex/cli mcp
```

## Documentation

Full documentation: https://github.com/ruslan-sazonov/UniKortex

## License

PolyForm Noncommercial 1.0.0
