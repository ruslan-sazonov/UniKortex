import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  SQLiteStorage,
  EntryService,
  ProjectService,
  RelationService,
  VaultSyncService,
  HybridSearchEngine,
  EmbeddingService,
  VectorStore,
  ContextRetriever,
  loadConfig,
  setConfigValue,
  isInitialized,
  type Config,
  type EntryType,
  type EntryStatus,
} from '@unikortex/core';

/**
 * Application context for MCP server
 */
interface AppContext {
  config: Config;
  storage: SQLiteStorage;
  entries: EntryService;
  projects: ProjectService;
  relations: RelationService;
  vault: VaultSyncService;
  searchEngine?: HybridSearchEngine;
  contextRetriever?: ContextRetriever;
}

let context: AppContext | null = null;

/**
 * Get the active project ID from config, or undefined for global scope
 */
async function getActiveProjectId(ctx: AppContext): Promise<string | undefined> {
  const config = loadConfig();
  if (!config.activeProject) {
    return undefined;
  }
  const project = await ctx.projects.getByName(config.activeProject);
  return project?.id;
}

/**
 * Get the active project name from config
 */
function getActiveProjectName(): string | undefined {
  const config = loadConfig();
  return config.activeProject;
}

/**
 * Initialize the application context
 */
async function getContext(): Promise<AppContext> {
  if (context) {
    return context;
  }

  if (!isInitialized()) {
    throw new Error('UniKortex is not initialized. Run "unikortex init" first.');
  }

  const config = loadConfig();
  const storage = new SQLiteStorage();
  await storage.initialize();

  // Try to initialize embedding service for semantic search
  let embeddingService: EmbeddingService | undefined;
  let vectorStore: VectorStore | undefined;
  let searchEngine: HybridSearchEngine | undefined;
  let contextRetriever: ContextRetriever | undefined;

  try {
    embeddingService = new EmbeddingService(config.embeddings);
    await embeddingService.initialize();

    const db = (storage as unknown as { db: unknown }).db;
    vectorStore = new VectorStore(
      db as ConstructorParameters<typeof VectorStore>[0],
      embeddingService.dimensions
    );
    await vectorStore.initialize();

    searchEngine = new HybridSearchEngine(storage, embeddingService, vectorStore);
    contextRetriever = new ContextRetriever(storage, embeddingService, vectorStore);
  } catch {
    // Semantic search not available, use keyword-only
    searchEngine = new HybridSearchEngine(storage);
    contextRetriever = new ContextRetriever(storage);
  }

  context = {
    config,
    storage,
    entries: new EntryService(storage),
    projects: new ProjectService(storage),
    relations: new RelationService(storage),
    vault: new VaultSyncService(storage, config),
    searchEngine,
    contextRetriever,
  };

  return context;
}

/**
 * Create and start the MCP server
 */
async function main() {
  const ctx = await getContext();

  const server = new McpServer({
    name: 'unikortex',
    version: '0.1.0',
  });

  // Tool: unikortex_save
  // Save content to the knowledge base
  server.tool(
    'unikortex_save',
    'Save content to the knowledge base. Use this when the user wants to save a decision, research finding, code artifact, or any valuable information for future reference. If no project is specified, saves to the active project (or requires project if none is active).',
    {
      title: z.string().describe('Short descriptive title for the entry'),
      content: z.string().describe('The content to save (Markdown supported)'),
      project: z
        .string()
        .optional()
        .describe(
          "Project name to save under (optional - uses active project if set, will create if doesn't exist)"
        ),
      type: z
        .enum(['decision', 'research', 'artifact', 'note', 'reference'])
        .describe('Type of entry'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
      contextSummary: z
        .string()
        .optional()
        .describe(
          'Brief summary for search optimization (optional, auto-generated if not provided)'
        ),
    },
    async ({ title, content, project: projectName, type, tags, contextSummary }) => {
      try {
        // Determine project: explicit > active > error
        const effectiveProjectName = projectName ?? getActiveProjectName();

        if (!effectiveProjectName) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error:
                      'No project specified and no active project set. Either provide a project name or set an active project with unikortex_set_project.',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Get or create project
        const project = await ctx.projects.getOrCreate(effectiveProjectName, effectiveProjectName);

        // Create entry
        const entry = await ctx.entries.create({
          projectId: project.id,
          title,
          type: type as EntryType,
          status: 'active' as EntryStatus,
          content,
          tags: tags ?? [],
          contextSummary,
        });

        // Sync to vault if enabled
        if (ctx.config.vault?.enabled) {
          await ctx.vault.syncEntry(entry);
        }

        // Auto-index for semantic search
        if (ctx.searchEngine) {
          try {
            await ctx.searchEngine.indexEntry(entry);
          } catch {
            // Ignore indexing errors
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  id: entry.id,
                  title: entry.title,
                  project: project.name,
                  message: `Saved "${entry.title}" to project "${project.name}"`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: (error as Error).message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: unikortex_search
  // Search the knowledge base
  server.tool(
    'unikortex_search',
    'Search the knowledge base for relevant entries. Use this when the user asks about past decisions, wants to find previous research, or needs context from earlier work. By default, searches within the active project if one is set.',
    {
      query: z.string().describe('Natural language search query'),
      project: z
        .string()
        .optional()
        .describe('Filter to specific project (optional - defaults to active project if set)'),
      allProjects: z
        .boolean()
        .optional()
        .describe('Search all projects, ignoring active project filter (default: false)'),
      type: z
        .enum(['decision', 'research', 'artifact', 'note', 'reference'])
        .optional()
        .describe('Filter by entry type (optional)'),
      limit: z.number().optional().default(5).describe('Maximum results to return (default: 5)'),
    },
    async ({ query, project: projectName, allProjects, type, limit }) => {
      try {
        let projectId: string | undefined;
        let scopeDescription: string;

        if (allProjects) {
          // Explicit global search
          projectId = undefined;
          scopeDescription = 'all projects';
        } else if (projectName) {
          // Explicit project filter
          const project = await ctx.projects.getByName(projectName);
          if (project) {
            projectId = project.id;
            scopeDescription = `project "${projectName}"`;
          } else {
            scopeDescription = 'all projects (specified project not found)';
          }
        } else {
          // Use active project if set
          projectId = await getActiveProjectId(ctx);
          const activeProjectName = getActiveProjectName();
          scopeDescription = activeProjectName
            ? `project "${activeProjectName}" (active)`
            : 'all projects';
        }

        const results = await ctx.searchEngine!.search({
          query,
          mode: 'hybrid',
          filters: {
            projectId,
            type: type ? [type as EntryType] : undefined,
          },
          limit: limit ?? 5,
        });

        const formattedResults = await Promise.all(
          results.map(async (r) => {
            const project = await ctx.projects.get(r.entry.projectId);
            return {
              id: r.entry.id,
              title: r.entry.title,
              project: project?.name ?? 'unknown',
              type: r.entry.type,
              status: r.entry.status,
              relevanceScore: r.score,
              summary: r.entry.contextSummary ?? r.entry.content.slice(0, 200),
              contentPreview: r.entry.content.slice(0, 500),
              tags: r.entry.tags,
              createdAt: r.entry.createdAt.toISOString(),
            };
          })
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  results: formattedResults,
                  totalFound: results.length,
                  searchQuery: query,
                  scope: scopeDescription,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: (error as Error).message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: unikortex_get
  // Get a specific entry by ID
  server.tool(
    'unikortex_get',
    'Retrieve a specific entry by ID. Use when you need the full content of a known entry.',
    {
      id: z.string().describe('Entry ID (e.g., unikortex_7x8f2m9p3q1w)'),
      includeRelated: z.boolean().optional().default(false).describe('Include related entries'),
    },
    async ({ id, includeRelated }) => {
      try {
        const entry = await ctx.entries.get(id);

        if (!entry) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error: `Entry with ID "${id}" not found`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const project = await ctx.projects.get(entry.projectId);

        const result: Record<string, unknown> = {
          id: entry.id,
          title: entry.title,
          project: project?.name ?? 'unknown',
          type: entry.type,
          status: entry.status,
          content: entry.content,
          tags: entry.tags,
          contextSummary: entry.contextSummary,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        };

        if (includeRelated) {
          const relations = await ctx.relations.getRelations(id);
          const relatedEntries = await Promise.all(
            relations.map(async (rel: { fromId: string; toId: string; relationType: string }) => {
              const relatedId = rel.fromId === id ? rel.toId : rel.fromId;
              const relatedEntry = await ctx.entries.get(relatedId);
              return relatedEntry
                ? {
                    id: relatedEntry.id,
                    title: relatedEntry.title,
                    type: relatedEntry.type,
                    relationType: rel.relationType,
                  }
                : null;
            })
          );
          result.relations = relatedEntries.filter(Boolean);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: (error as Error).message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: unikortex_list_projects
  // List all projects
  server.tool(
    'unikortex_list_projects',
    'List all projects in the knowledge base. Shows which project is currently active.',
    {},
    async () => {
      try {
        const projects = await ctx.projects.list();
        const activeProjectName = getActiveProjectName();

        const formattedProjects = projects.map((p) => ({
          name: p.name,
          displayName: p.displayName,
          description: p.description,
          isActive: p.name === activeProjectName,
          createdAt: p.createdAt.toISOString(),
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  projects: formattedProjects,
                  total: projects.length,
                  activeProject: activeProjectName ?? null,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: (error as Error).message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: unikortex_update_status
  // Update the status of an entry
  server.tool(
    'unikortex_update_status',
    'Update the status of an entry (e.g., mark as superseded).',
    {
      id: z.string().describe('Entry ID to update'),
      status: z.enum(['draft', 'active', 'superseded', 'archived']).describe('New status'),
      supersededBy: z
        .string()
        .optional()
        .describe('ID of entry that supersedes this one (when status=superseded)'),
    },
    async ({ id, status, supersededBy }) => {
      try {
        const entry = await ctx.entries.get(id);

        if (!entry) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error: `Entry with ID "${id}" not found`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const updated = await ctx.entries.update(id, {
          status: status as EntryStatus,
          supersedes: supersededBy,
        });

        // Sync to vault if enabled
        if (ctx.config.vault?.enabled && updated) {
          await ctx.vault.syncEntry(updated);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  id: updated?.id,
                  title: updated?.title,
                  status: updated?.status,
                  message: `Updated status of "${updated?.title}" to "${status}"`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: (error as Error).message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: unikortex_context
  // Get formatted context for LLM consumption
  server.tool(
    'unikortex_context',
    'Get relevant context from the knowledge base formatted for LLM consumption. Use this to retrieve multiple relevant entries at once. By default, retrieves context from the active project if one is set.',
    {
      query: z.string().describe('Query to find relevant context'),
      project: z
        .string()
        .optional()
        .describe('Filter to specific project (optional - defaults to active project if set)'),
      allProjects: z
        .boolean()
        .optional()
        .describe('Search all projects, ignoring active project filter (default: false)'),
      maxTokens: z
        .number()
        .optional()
        .default(4000)
        .describe('Maximum tokens to return (default: 4000)'),
      format: z
        .enum(['xml', 'markdown'])
        .optional()
        .default('xml')
        .describe('Output format (default: xml)'),
    },
    async ({ query, project: projectName, allProjects, maxTokens, format }) => {
      try {
        let projectId: string | undefined;

        if (allProjects) {
          projectId = undefined;
        } else if (projectName) {
          const project = await ctx.projects.getByName(projectName);
          if (project) {
            projectId = project.id;
          }
        } else {
          // Use active project if set
          projectId = await getActiveProjectId(ctx);
        }

        const result = await ctx.contextRetriever!.retrieve({
          query,
          maxTokens: maxTokens ?? 4000,
          filters: { projectId },
          includeRelated: false,
        });

        const formatted = ctx.contextRetriever!.formatForLLM(
          result,
          (format ?? 'xml') as 'xml' | 'markdown'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: formatted,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: (error as Error).message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: unikortex_set_project
  // Set the active project for all operations
  server.tool(
    'unikortex_set_project',
    'Set the active project. All subsequent save, search, and context operations will default to this project. Use this at the start of a conversation to focus on a specific project.',
    {
      project: z.string().describe('Project name to set as active'),
    },
    async ({ project: projectName }) => {
      try {
        // Verify project exists
        const project = await ctx.projects.getByName(projectName);

        if (!project) {
          // List available projects
          const projects = await ctx.projects.list();
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error: `Project "${projectName}" not found`,
                    availableProjects: projects.map((p) => p.name),
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Update config
        setConfigValue('activeProject', projectName);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  activeProject: projectName,
                  message: `Active project set to "${projectName}". All searches and saves will now default to this project.`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: (error as Error).message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: unikortex_clear_project
  // Clear the active project to enable global scope
  server.tool(
    'unikortex_clear_project',
    'Clear the active project. Searches will include all projects.',
    {},
    async () => {
      try {
        const previousProject = getActiveProjectName();
        setConfigValue('activeProject', undefined);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  previousProject: previousProject ?? null,
                  message: 'Active project cleared. Searches will now include all projects.',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: (error as Error).message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Prompt: unikortex_guidance
  // Provides guidance on how to use UniKortex effectively
  server.prompt(
    'unikortex_guidance',
    'Get guidance on how to use UniKortex for knowledge management',
    async () => {
      const activeProject = getActiveProjectName();
      const projects = await ctx.projects.list();

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `You have access to UniKortex, a persistent knowledge base. Here's how to use it effectively:

## Current State
- Active project: ${activeProject ?? 'None (global scope)'}
- Available projects: ${projects.map((p) => p.name).join(', ') || 'None'}

## When to Use UniKortex

### Search Before Deciding
Before making architectural decisions, design choices, or technology selections, search for relevant past decisions:
\`unikortex_search\` or \`unikortex_context\` with queries like "authentication approach" or "database selection"

### Save Important Decisions
After making significant decisions, save them for future reference:
\`unikortex_save\` with type="decision" - Include the context, options considered, and rationale

### Document Research
When researching technologies, patterns, or approaches:
\`unikortex_save\` with type="research" - Include findings, comparisons, and conclusions

### Store Reusable Artifacts
Save code snippets, configurations, and templates that may be useful later:
\`unikortex_save\` with type="artifact"

## Project Scoping
Use \`unikortex_set_project\` to focus on a specific project's knowledge.
Use \`unikortex_list_projects\` to see available projects.

Remember: The knowledge you save today helps make better decisions tomorrow.`,
            },
          },
        ],
      };
    }
  );

  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the server
main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
