import { Command } from 'commander';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Find the MCP server entry point
 * Handles both development and production installations
 */
function findMcpPath(): string {
  // Try multiple possible locations
  const candidates = [
    // Development: bundled at packages/cli/dist/index.js -> ../mcp-stdio/dist/index.js
    path.resolve(__dirname, '../../mcp-stdio/dist/index.js'),
    // Development: if running from src directly
    path.resolve(__dirname, '../../../mcp-stdio/dist/index.js'),
    // Production: installed via npm, mcp-stdio is in node_modules
    path.resolve(__dirname, '../node_modules/@unikortex/mcp-stdio/dist/index.js'),
    // Monorepo node_modules hoisting
    path.resolve(__dirname, '../../../node_modules/@unikortex/mcp-stdio/dist/index.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback: try to require it directly (npm should resolve it)
  try {
    return require.resolve('@unikortex/mcp-stdio');
  } catch {
    // If all else fails, return the first candidate and let node give the error
    return candidates[0];
  }
}

export const mcpCommand = new Command('mcp')
  .description('Run the MCP server for Claude Desktop/Code integration')
  .action(async () => {
    const mcpPath = findMcpPath();

    // Spawn the MCP server process
    // The MCP server uses stdio transport, so we pass through stdin/stdout
    const mcpProcess = spawn('node', [mcpPath], {
      stdio: 'inherit',
      env: process.env,
    });

    mcpProcess.on('error', (error) => {
      console.error('Failed to start MCP server:', error.message);
      process.exit(1);
    });

    mcpProcess.on('exit', (code) => {
      process.exit(code ?? 0);
    });

    // Handle signals to gracefully shut down
    process.on('SIGINT', () => {
      mcpProcess.kill('SIGINT');
    });

    process.on('SIGTERM', () => {
      mcpProcess.kill('SIGTERM');
    });
  });
