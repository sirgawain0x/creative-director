#!/usr/bin/env node
/**
 * Launch ADK CLI with NODE_PATH pointing at this repo's node_modules.
 *
 * ADK bundles the agent into a temp dir and loads optional peers (e.g.
 * @modelcontextprotocol/sdk) via createRequire(import.meta.url). Without
 * NODE_PATH, that resolve can fail even when the package is installed.
 */
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoNodeModules = path.join(root, 'node_modules');
const adkEntry = path.join(
  repoNodeModules,
  '@google/adk-devtools/dist/esm/cli_entrypoint.js',
);

const existing = process.env.NODE_PATH?.trim();
process.env.NODE_PATH = existing
  ? `${repoNodeModules}${path.delimiter}${existing}`
  : repoNodeModules;

const child = spawn(process.execPath, [adkEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
