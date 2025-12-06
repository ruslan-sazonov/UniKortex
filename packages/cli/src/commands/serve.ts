import { Command } from 'commander';
import chalk from 'chalk';
import { createServer } from 'node:http';
import { withContext } from '../utils/context.js';
import {
  HybridSearchEngine,
  EmbeddingService,
  VectorStore,
  ContextRetriever,
  type EntryType,
  type EntryStatus,
  type EntryFilters as _EntryFilters,
} from '@unikortex/core';

interface ServeOptions {
  port?: string;
  host?: string;
}

/**
 * Lightweight local HTTP server for ChatGPT and other AI integrations
 * No authentication - runs locally only
 */
export const serveCommand = new Command('serve')
  .description('Start local API server for ChatGPT and other AI integrations')
  .option('-p, --port <port>', 'Server port', '3033')
  .option('-h, --host <host>', 'Server host (use 127.0.0.1 for local only)', '127.0.0.1')
  .action(async (options: ServeOptions) => {
    const port = parseInt(options.port ?? '3033', 10);
    const host = options.host ?? '127.0.0.1';

    console.log(chalk.blue('Starting UniKortex Local API Server...'));
    console.log(chalk.dim(`Listening on http://${host}:${port}`));
    console.log('');

    await withContext(async (ctx) => {
      // Initialize search engine
      let embeddingService: EmbeddingService | undefined;
      let vectorStore: VectorStore | undefined;
      let searchEngine: HybridSearchEngine;
      let contextRetriever: ContextRetriever;

      try {
        embeddingService = new EmbeddingService(ctx.config.embedding);
        await embeddingService.initialize();

        const db = (ctx.storage as unknown as { db: unknown }).db;
        vectorStore = new VectorStore(
          db as Parameters<ConstructorParameters<typeof VectorStore>[0]>,
          embeddingService.dimensions
        );
        await vectorStore.initialize();

        searchEngine = new HybridSearchEngine(ctx.storage, embeddingService, vectorStore);
        contextRetriever = new ContextRetriever(ctx.storage, embeddingService, vectorStore);
        console.log(chalk.green(`✓ Semantic search enabled (${embeddingService.providerName})`));
      } catch {
        searchEngine = new HybridSearchEngine(ctx.storage);
        contextRetriever = new ContextRetriever(ctx.storage);
        console.log(chalk.yellow('⚠ Running in keyword-only mode'));
      }

      const server = createServer(async (req, res) => {
        // CORS headers for local development
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = new URL(req.url ?? '/', `http://${host}:${port}`);
        const path = url.pathname;

        try {
          // Health check
          if (path === '/health' || path === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                status: 'ok',
                version: '0.1.0',
                mode: 'local',
                endpoints: [
                  'GET /openapi.json - OpenAPI spec for ChatGPT',
                  'GET /search?q=query - Search knowledge base',
                  'POST /context - Get context for LLM',
                  'GET /projects - List projects',
                  'POST /save - Save new entry',
                ],
              })
            );
            return;
          }

          // OpenAPI spec for ChatGPT
          if (path === '/openapi.json' || path === '/.well-known/openapi.json') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(generateOpenApiSpec(host, port)));
            return;
          }

          // Search endpoint
          if (path === '/search' && req.method === 'GET') {
            const query = url.searchParams.get('q') ?? '';
            const projectName = url.searchParams.get('project');
            const type = url.searchParams.get('type');
            const limit = parseInt(url.searchParams.get('limit') ?? '5', 10);

            let projectId: string | undefined;
            if (projectName) {
              const project = await ctx.projects.getByName(projectName);
              if (project) projectId = project.id;
            }

            const results = await searchEngine.search({
              query,
              mode: 'hybrid',
              filters: {
                projectId,
                type: type ? [type as EntryType] : undefined,
              },
              limit,
            });

            const enrichedResults = await Promise.all(
              results.map(async (r) => {
                const project = await ctx.projects.get(r.entry.projectId);
                return {
                  id: r.entry.id,
                  title: r.entry.title,
                  type: r.entry.type,
                  project: project?.name ?? 'unknown',
                  summary: r.entry.contextSummary ?? r.entry.content.slice(0, 200),
                  relevance: Math.round(r.score * 100),
                  tags: r.entry.tags,
                };
              })
            );

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ results: enrichedResults, query }));
            return;
          }

          // Context endpoint
          if (path === '/context' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            const { query, project: projectName, maxTokens = 4000, format = 'markdown' } = body;

            let projectId: string | undefined;
            if (projectName) {
              const project = await ctx.projects.getByName(projectName);
              if (project) projectId = project.id;
            }

            const result = await contextRetriever.retrieve({
              query,
              maxTokens,
              filters: { projectId },
            });

            if (format === 'json') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } else {
              const formatted = contextRetriever.formatForLLM(result, format as 'xml' | 'markdown');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  content: formatted,
                  itemCount: result.items.length,
                  tokensEstimate: result.totalTokensEstimate,
                })
              );
            }
            return;
          }

          // Context GET endpoint (for simpler integrations)
          if (path === '/context' && req.method === 'GET') {
            const query = url.searchParams.get('q') ?? '';
            const projectName = url.searchParams.get('project');
            const maxTokens = parseInt(url.searchParams.get('maxTokens') ?? '4000', 10);
            const format = url.searchParams.get('format') ?? 'markdown';

            let projectId: string | undefined;
            if (projectName) {
              const project = await ctx.projects.getByName(projectName);
              if (project) projectId = project.id;
            }

            const result = await contextRetriever.retrieve({
              query,
              maxTokens,
              filters: { projectId },
            });

            const formatted = contextRetriever.formatForLLM(result, format as 'xml' | 'markdown');

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                content: formatted,
                itemCount: result.items.length,
                tokensEstimate: result.totalTokensEstimate,
              })
            );
            return;
          }

          // List projects
          if (path === '/projects' && req.method === 'GET') {
            const projects = await ctx.projects.list();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                projects: projects.map((p) => ({
                  name: p.name,
                  displayName: p.displayName,
                  description: p.description,
                })),
              })
            );
            return;
          }

          // Save entry
          if (path === '/save' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            const { title, content, project: projectName, type, tags = [], contextSummary } = body;

            if (!title || !content || !projectName || !type) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({ error: 'Missing required fields: title, content, project, type' })
              );
              return;
            }

            const project = await ctx.projects.getOrCreate(projectName, projectName);
            const entry = await ctx.entries.create({
              projectId: project.id,
              title,
              type: type as EntryType,
              status: 'active' as EntryStatus,
              content,
              tags,
              contextSummary,
            });

            // Auto-index
            try {
              await searchEngine.indexEntry(entry);
            } catch {
              // Ignore indexing errors
            }

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: true,
                id: entry.id,
                title: entry.title,
                project: project.name,
              })
            );
            return;
          }

          // Get entry by ID
          if (path.startsWith('/entries/') && req.method === 'GET') {
            const id = path.slice('/entries/'.length);
            const entry = await ctx.entries.get(id);

            if (!entry) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Entry not found' }));
              return;
            }

            const project = await ctx.projects.get(entry.projectId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                ...entry,
                project: project?.name,
              })
            );
            return;
          }

          // 404
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        } catch (error) {
          console.error(chalk.red('Request error:'), error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });

      server.listen(port, host, () => {
        console.log('');
        console.log(chalk.green('Server is running!'));
        console.log('');
        console.log(chalk.bold('For ChatGPT Custom GPT:'));
        console.log(chalk.dim('  1. Create a Custom GPT at https://chat.openai.com/gpts/editor'));
        console.log(chalk.dim('  2. Go to "Configure" → "Actions" → "Create new action"'));
        console.log(chalk.dim(`  3. Import from URL: http://${host}:${port}/openapi.json`));
        console.log(chalk.dim('  4. For remote access, use ngrok: ngrok http ' + port));
        console.log('');
        console.log(chalk.bold('API Endpoints:'));
        console.log(chalk.dim(`  GET  http://${host}:${port}/search?q=your+query`));
        console.log(chalk.dim(`  GET  http://${host}:${port}/context?q=your+query`));
        console.log(chalk.dim(`  POST http://${host}:${port}/save`));
        console.log(chalk.dim(`  GET  http://${host}:${port}/projects`));
        console.log('');
        console.log(chalk.dim('Press Ctrl+C to stop'));
      });

      // Keep the server running
      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => {
          console.log(chalk.dim('\nShutting down...'));
          server.close();
          resolve();
        });
        process.on('SIGTERM', () => {
          server.close();
          resolve();
        });
      });
    });
  });

/**
 * Parse JSON body from request
 */
async function parseJsonBody(
  req: import('node:http').IncomingMessage
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Generate OpenAPI spec for ChatGPT Actions
 */
function generateOpenApiSpec(host: string, port: number) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'UniKortex Knowledge Base',
      description:
        'Access your personal knowledge base with decisions, research, artifacts, and notes. Use this to recall past decisions, find relevant context, and save new knowledge.',
      version: '0.1.0',
    },
    servers: [
      {
        url: `http://${host}:${port}`,
        description: 'Local UniKortex server',
      },
    ],
    paths: {
      '/search': {
        get: {
          operationId: 'searchKnowledgeBase',
          summary: 'Search the knowledge base',
          description:
            'Search for entries in the knowledge base using natural language. Returns relevant decisions, research, artifacts, and notes.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Natural language search query',
            },
            {
              name: 'project',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Filter by project name',
            },
            {
              name: 'type',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['decision', 'research', 'artifact', 'note', 'reference'],
              },
              description: 'Filter by entry type',
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 5 },
              description: 'Maximum results to return',
            },
          ],
          responses: {
            '200': {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      results: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            title: { type: 'string' },
                            type: { type: 'string' },
                            project: { type: 'string' },
                            summary: { type: 'string' },
                            relevance: { type: 'integer' },
                            tags: { type: 'array', items: { type: 'string' } },
                          },
                        },
                      },
                      query: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/context': {
        get: {
          operationId: 'getContext',
          summary: 'Get relevant context from knowledge base',
          description:
            'Retrieve relevant entries formatted for LLM consumption. Use this when you need detailed context about a topic.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Query to find relevant context',
            },
            {
              name: 'project',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Filter by project name',
            },
            {
              name: 'maxTokens',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 4000 },
              description: 'Maximum tokens to return',
            },
          ],
          responses: {
            '200': {
              description: 'Context content',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      content: { type: 'string', description: 'Formatted context in markdown' },
                      itemCount: { type: 'integer' },
                      tokensEstimate: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/projects': {
        get: {
          operationId: 'listProjects',
          summary: 'List all projects',
          description: 'Get a list of all projects in the knowledge base.',
          responses: {
            '200': {
              description: 'List of projects',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      projects: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            displayName: { type: 'string' },
                            description: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/save': {
        post: {
          operationId: 'saveToKnowledgeBase',
          summary: 'Save content to knowledge base',
          description:
            'Save a new entry (decision, research, artifact, note, or reference) to the knowledge base.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'content', 'project', 'type'],
                  properties: {
                    title: { type: 'string', description: 'Short descriptive title' },
                    content: { type: 'string', description: 'Full content (Markdown supported)' },
                    project: { type: 'string', description: 'Project name to save under' },
                    type: {
                      type: 'string',
                      enum: ['decision', 'research', 'artifact', 'note', 'reference'],
                      description: 'Type of entry',
                    },
                    tags: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Tags for categorization',
                    },
                    contextSummary: {
                      type: 'string',
                      description: 'Brief summary for search optimization',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Entry created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      id: { type: 'string' },
                      title: { type: 'string' },
                      project: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/entries/{id}': {
        get: {
          operationId: 'getEntry',
          summary: 'Get entry by ID',
          description: 'Retrieve full details of a specific entry by its ID.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Entry ID',
            },
          ],
          responses: {
            '200': {
              description: 'Entry details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      type: { type: 'string' },
                      status: { type: 'string' },
                      content: { type: 'string' },
                      project: { type: 'string' },
                      tags: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
