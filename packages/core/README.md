# @unikortex/core

Core library for UniKortex - storage, search, and embedding services for the unified knowledge base.

## Installation

```bash
npm install @unikortex/core
```

## Features

- **SQLite Storage** - Persistent storage for entries, projects, and relations
- **Hybrid Search** - Combined keyword (FTS5) and semantic vector search
- **Embedding Service** - Support for OpenAI, Ollama, and local Transformers.js
- **Context Retrieval** - Smart context extraction for LLM consumption
- **Obsidian Sync** - Bidirectional sync with Obsidian vaults

## Usage

```typescript
import {
  SQLiteStorage,
  HybridSearchEngine,
  EmbeddingService,
  ContextRetriever,
} from '@unikortex/core';

// Initialize storage
const storage = new SQLiteStorage('/path/to/db.sqlite');
await storage.initialize();

// Create embedding service (optional, for semantic search)
const embeddings = await EmbeddingService.create({ provider: 'transformers' });

// Initialize search engine
const searchEngine = new HybridSearchEngine(storage, embeddings);

// Search entries
const results = await searchEngine.search('typescript patterns', {
  limit: 10,
  mode: 'hybrid',
});

// Get context for LLM
const contextRetriever = new ContextRetriever(storage, embeddings);
const context = await contextRetriever.retrieve({
  query: 'authentication decisions',
  maxTokens: 4000,
});
```

## Entry Types

- `decision` - Architectural and design decisions
- `research` - Research findings and analysis
- `artifact` - Code snippets, configs, templates
- `note` - General notes and observations
- `reference` - Links to external resources

## Documentation

Full documentation: https://github.com/ruslan-sazonov/UniKortex

## License

PolyForm Noncommercial 1.0.0
