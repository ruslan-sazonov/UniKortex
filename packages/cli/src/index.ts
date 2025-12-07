import { Command } from 'commander';
import { createRequire } from 'node:module';
import { initCommand } from './commands/init.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { showCommand } from './commands/show.js';
import { editCommand } from './commands/edit.js';
import { updateCommand } from './commands/update.js';
import { deleteCommand } from './commands/delete.js';
import { projectsCommand } from './commands/projects.js';
import { relateCommand } from './commands/relate.js';
import { relationsCommand } from './commands/relations.js';
import { unrelateCommand } from './commands/unrelate.js';
import { configCommand } from './commands/config.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { searchCommand } from './commands/search.js';
import { contextCommand } from './commands/context.js';
import { reindexCommand } from './commands/reindex.js';
import { mcpCommand } from './commands/mcp.js';
import { mcpConfigCommand } from './commands/mcp-config.js';
import { serverCommand } from './commands/server.js';
import { serveCommand } from './commands/serve.js';
import { syncCommand } from './commands/sync.js';

const program = new Command();

program.name('unikortex').description('Unified Knowledge Base for AI Workflows').version(version);

// Register commands
program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(editCommand);
program.addCommand(updateCommand);
program.addCommand(deleteCommand);
program.addCommand(projectsCommand);
program.addCommand(relateCommand);
program.addCommand(relationsCommand);
program.addCommand(unrelateCommand);
program.addCommand(configCommand);
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(searchCommand);
program.addCommand(contextCommand);
program.addCommand(reindexCommand);
program.addCommand(mcpCommand);
program.addCommand(mcpConfigCommand);
program.addCommand(serverCommand);
program.addCommand(serveCommand);
program.addCommand(syncCommand);

program.parse();
