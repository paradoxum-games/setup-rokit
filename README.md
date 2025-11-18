# setup-rokit

**The fast, cached GitHub Action for Rokit** — the official Roblox toolchain manager.

Automatically installs Rokit and all your tools (Rojo, Wally, Selene, Stylua, etc.) from `rokit.toml`, `aftman.toml`, or `foreman.toml` in CI.

[![CI](https://github.com/paradoxum-games/setup-rokit/actions/workflows/test.yml/badge.svg)](https://github.com/paradoxum-games/setup-rokit/actions/workflows/test.yml)

## Features

- Supports **Windows**, **macOS** (Intel + Apple Silicon), and **Linux**
- Full caching of `~/.rokit` → subsequent runs are 5–10× faster
- Smart cache keys (invalidates when your toml or Rokit version changes)
- Works with `version: latest` (default) or any specific tag
- Fully compatible with old `aftman.toml` and `foreman.toml` files
- Drop-in replacement for the old archived actions

## Usage

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Setup Rokit
    uses: paradoxum-games/setup-rokit@v1
    with:
      cache: true   # highly recommended (default: false)
