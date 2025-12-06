# Contributing to UniKortex

Thank you for your interest in contributing to UniKortex! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Development Setup

```bash
# Clone the repository
git clone https://github.com/unikortex/unikortex.git
cd unikortex

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Project Structure

```
packages/
├── core/          # Core library (storage, search, services)
├── cli/           # Command-line interface
└── mcp-stdio/     # MCP server for AI integrations
```

## Development Workflow

### Running in Development Mode

```bash
# Watch mode for all packages
pnpm dev

# Or for a specific package
pnpm --filter @unikortex/cli dev
```

### Testing

```bash
# Run all tests in watch mode
pnpm test

# Run tests once
pnpm test:run

# Run tests for a specific package
pnpm --filter @unikortex/core test
```

### Linting and Formatting

```bash
# Check linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Check formatting
pnpm format:check

# Fix formatting
pnpm format
```

## Making Changes

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or fixes

Example: `feature/obsidian-sync-improvements`

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting, no code change
- `refactor` - Code restructuring
- `test` - Adding tests
- `chore` - Maintenance

Examples:
```
feat(cli): add --format flag to list command
fix(core): handle empty search results correctly
docs: update MCP configuration examples
```

### Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Ensure all tests pass: `pnpm test:run`
5. Ensure linting passes: `pnpm lint`
6. Push your branch and create a PR

#### PR Description Template

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Linting passes
```

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use explicit types for function parameters and returns
- Prefer interfaces over type aliases for object shapes
- Use async/await over raw promises

### File Organization

```typescript
// 1. Imports (external, then internal)
import { something } from 'external-package';
import { internal } from './internal.js';

// 2. Types/Interfaces
interface MyInterface {
  // ...
}

// 3. Constants
const CONSTANT = 'value';

// 4. Main code (classes, functions)
export class MyClass {
  // ...
}

// 5. Helper functions (private)
function helperFunction() {
  // ...
}
```

## Adding New Features

### Adding a CLI Command

1. Create a new file in `packages/cli/src/commands/`
2. Export the command using Commander.js
3. Register it in `packages/cli/src/index.ts`
4. Add tests in `packages/cli/tests/`
5. Update README with usage examples

### Adding a Core Service

1. Create the service in `packages/core/src/services/`
2. Export from `packages/core/src/index.ts`
3. Add comprehensive tests
4. Document the API

### Adding an MCP Tool

1. Add the tool definition in `packages/mcp-stdio/src/index.ts`
2. Include clear description for AI assistants
3. Test with Claude Desktop or Claude Code
4. Update README with tool documentation

## Testing Guidelines

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService();
  });

  it('should do something', () => {
    const result = service.doSomething();
    expect(result).toBe('expected');
  });
});
```

### Integration Tests

For tests requiring a database, use a temporary in-memory database:

```typescript
import { SQLiteStorage } from '@unikortex/core';

let storage: SQLiteStorage;

beforeEach(async () => {
  storage = new SQLiteStorage(':memory:');
  await storage.initialize();
});
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Include code examples where helpful

## Reporting Issues

### Bug Reports

Include:
- UniKortex version (`unikortex --version`)
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages/logs

### Feature Requests

Include:
- Use case / problem to solve
- Proposed solution
- Alternatives considered

## Questions?

- Open a [GitHub Discussion](https://github.com/unikortex/unikortex/discussions)
- Check existing issues and PRs

Thank you for contributing!
