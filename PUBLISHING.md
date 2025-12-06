# Publishing Guide

This guide covers how to publish UniKortex to npm and Homebrew.

## Prerequisites

1. npm account with publish access
2. GitHub repository set up
3. For Homebrew: a GitHub personal access token

## Publishing to npm

### 1. Update Package Names (if needed)

The packages use the `@unikortex` scope. Make sure you have access to this scope on npm:

```bash
npm login
npm access ls-packages
```

If you need to use a different scope, update these files:
- `packages/core/package.json` - change `@unikortex/core`
- `packages/cli/package.json` - change `@unikortex/cli` and dependency
- `packages/mcp-stdio/package.json` - change `@unikortex/mcp-stdio` and dependencies

### 2. Prepare for Publishing

```bash
# Make sure everything builds
pnpm install
pnpm build
pnpm test:run

# Check what will be published
cd packages/cli
npm pack --dry-run
```

### 3. Update Versions

Using pnpm's version command (recommended):

```bash
# For patch release (0.1.0 -> 0.1.1)
pnpm -r exec npm version patch

# For minor release (0.1.0 -> 0.2.0)
pnpm -r exec npm version minor

# For major release (0.1.0 -> 1.0.0)
pnpm -r exec npm version major
```

Or manually update each `package.json`.

### 4. Publish to npm

```bash
# Build all packages
pnpm build

# Publish core first (it's a dependency)
cd packages/core
npm publish --access public

# Publish MCP package
cd ../mcp-stdio
npm publish --access public

# Publish CLI last
cd ../cli
npm publish --access public
```

### 5. Verify Installation

```bash
# Test global install
npm install -g @unikortex/cli
unikortex --version

# Test npx
npx @unikortex/cli --help
```

## Automated npm Publishing with GitHub Actions

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm build
      - run: pnpm test:run

      # Publish packages in order
      - run: npm publish --access public
        working-directory: packages/core
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - run: npm publish --access public
        working-directory: packages/mcp-stdio
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - run: npm publish --access public
        working-directory: packages/cli
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Add `NPM_TOKEN` to your repository secrets (Settings → Secrets and variables → Actions).

## Publishing to Homebrew

### Option 1: Create Your Own Tap (Recommended)

A "tap" is a third-party Homebrew repository.

#### 1. Create the Tap Repository

Create a new GitHub repository named `homebrew-tap`:

```bash
# On GitHub, create: unikortex/homebrew-tap
# Then clone it:
git clone https://github.com/unikortex/homebrew-tap.git
cd homebrew-tap
```

#### 2. Create the Formula

Create `Formula/unikortex.rb`:

```ruby
class Unikortex < Formula
  desc "Unified Knowledge Base for AI Workflows"
  homepage "https://github.com/unikortex/unikortex"
  url "https://registry.npmjs.org/@unikortex/cli/-/cli-0.1.0.tgz"
  sha256 "REPLACE_WITH_ACTUAL_SHA256"
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "UniKortex", shell_output("#{bin}/unikortex --help")
  end
end
```

#### 3. Get the SHA256

```bash
# After publishing to npm:
curl -sL https://registry.npmjs.org/@unikortex/cli/-/cli-0.1.0.tgz | shasum -a 256
```

#### 4. Test Locally

```bash
brew install --build-from-source ./Formula/unikortex.rb
```

#### 5. Push and Install

```bash
git add Formula/unikortex.rb
git commit -m "Add unikortex formula v0.1.0"
git push

# Users can now install with:
brew tap unikortex/tap
brew install unikortex
```

### Option 2: Alternative - Binary Distribution

For better performance, distribute pre-built binaries using `pkg` or `esbuild`:

#### 1. Build Standalone Binaries

Add to `package.json`:

```json
{
  "scripts": {
    "build:binary": "pkg . --targets node20-macos-x64,node20-macos-arm64,node20-linux-x64"
  },
  "devDependencies": {
    "pkg": "^5.8.0"
  }
}
```

#### 2. Create Release Assets

```bash
pnpm build:binary
# Creates: unikortex-macos-x64, unikortex-macos-arm64, unikortex-linux-x64
```

#### 3. Create Homebrew Formula for Binaries

```ruby
class Unikortex < Formula
  desc "Unified Knowledge Base for AI Workflows"
  homepage "https://github.com/unikortex/unikortex"
  version "0.1.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/unikortex/unikortex/releases/download/v0.1.0/unikortex-macos-arm64.tar.gz"
      sha256 "REPLACE_WITH_ARM64_SHA256"
    end
    on_intel do
      url "https://github.com/unikortex/unikortex/releases/download/v0.1.0/unikortex-macos-x64.tar.gz"
      sha256 "REPLACE_WITH_X64_SHA256"
    end
  end

  on_linux do
    url "https://github.com/unikortex/unikortex/releases/download/v0.1.0/unikortex-linux-x64.tar.gz"
    sha256 "REPLACE_WITH_LINUX_SHA256"
  end

  def install
    bin.install "unikortex"
  end

  test do
    assert_match "UniKortex", shell_output("#{bin}/unikortex --help")
  end
end
```

### Automated Homebrew Updates

Create `.github/workflows/homebrew.yml`:

```yaml
name: Update Homebrew Formula

on:
  release:
    types: [published]

jobs:
  homebrew:
    runs-on: ubuntu-latest
    steps:
      - name: Update Homebrew formula
        uses: mislav/bump-homebrew-formula-action@v3
        with:
          formula-name: unikortex
          homebrew-tap: unikortex/homebrew-tap
        env:
          COMMITTER_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
```

## Release Checklist

- [ ] Update version numbers in all `package.json` files
- [ ] Update CHANGELOG.md
- [ ] Run `pnpm build && pnpm test:run`
- [ ] Create git tag: `git tag v0.1.0`
- [ ] Push tag: `git push origin v0.1.0`
- [ ] Create GitHub release
- [ ] Publish to npm
- [ ] Update Homebrew formula with new SHA256
- [ ] Test installation: `npm i -g @unikortex/cli` and `brew upgrade unikortex`

## Troubleshooting

### npm publish fails with 403

Make sure you're logged in and have access to the scope:

```bash
npm login
npm access ls-packages
```

### Homebrew formula fails to install

1. Check the SHA256 matches the actual tarball
2. Test locally: `brew install --build-from-source --verbose ./Formula/unikortex.rb`
3. Check dependencies are available

### better-sqlite3 compilation issues

This package has native dependencies. For npm distribution, it compiles on user's machine. For Homebrew binaries, you may need to bundle or prebuild.
