# Chert Coin Explorer

Blockchain explorer (Angular frontend, Rust backend API). Displays blocks, txs, telemetry, and governance data.

## Dev setup

This project depends on `@silica-protocol/*` packages published in GitHub Packages.

Before running `npm ci`/`npm install`, export a GitHub Packages token:

- `NODE_AUTH_TOKEN`: GitHub Personal Access Token with at least `read:packages`

The registry mapping lives in `.npmrc`:

- `@silica-protocol:registry=https://npm.pkg.github.com`

inspire by:
https://kgi.kaspad.net
