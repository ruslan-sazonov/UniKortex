import { Command } from 'commander';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const mcpCommand = new Command('mcp')
  .description('Run the MCP server for Claude Desktop/Code integration')
  .action(async () => {
    // Find the mcp-stdio package's entry point
    // In production, this would be installed alongside the CLI
    const mcpPath = path.resolve(__dirname, '../../../mcp-stdio/dist/index.js');

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
