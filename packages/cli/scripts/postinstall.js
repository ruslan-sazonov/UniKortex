#!/usr/bin/env node

// Post-install script to show getting started instructions
// This runs after npm install -g @unikortex/cli

const message = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🧠 UniKortex installed successfully!                        ║
║                                                               ║
║   Get started:                                                ║
║                                                               ║
║   1. Initialize:    unikortex init                            ║
║   2. Create project: unikortex projects create my-project     ║
║   3. Add knowledge:  unikortex add --type decision            ║
║                                                               ║
║   Connect to AI assistants:                                   ║
║                                                               ║
║   • Claude Desktop: Auto-configured during init               ║
║   • Claude Code:    unikortex mcp-config --format claude-code ║
║   • All configs:    unikortex mcp-config                      ║
║                                                               ║
║   Documentation: https://github.com/unikortex/unikortex       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

console.log(message);
