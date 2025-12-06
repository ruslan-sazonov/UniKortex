import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ServerOptions {
  port?: string;
  host?: string;
}

export const serverCommand = new Command('server')
  .description('Start the UniKortex team server (requires PostgreSQL)')
  .option('-p, --port <port>', 'Server port', '3033')
  .option('-h, --host <host>', 'Server host', '0.0.0.0')
  .action(async (options: ServerOptions) => {
    console.log(chalk.blue('Starting UniKortex Team Server...'));
    console.log(chalk.dim(`Host: ${options.host}:${options.port}`));
    console.log('');

    // Check if server package is available
    const serverPath = path.resolve(__dirname, '../../../server/dist/index.js');

    try {
      // Set environment variables
      const env = {
        ...process.env,
        HOST: options.host,
        PORT: options.port,
      };

      const serverProcess = spawn('node', [serverPath], {
        stdio: 'inherit',
        env,
      });

      serverProcess.on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error(chalk.red('Server package not found.'));
          console.error(chalk.dim('Install with: pnpm add @unikortex/server'));
        } else {
          console.error(chalk.red(`Failed to start server: ${error.message}`));
        }
        process.exit(1);
      });

      serverProcess.on('exit', (code) => {
        process.exit(code ?? 0);
      });

      // Handle signals
      process.on('SIGINT', () => serverProcess.kill('SIGINT'));
      process.on('SIGTERM', () => serverProcess.kill('SIGTERM'));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });
