#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { LABEL, parsePlistOptions, renderPlist } from './plist.mjs';

const USAGE = `Usage: node scripts/service.mjs <install|uninstall|status|restart> [options]

Options:
  --port <n>              server port (default 4280, or the installed value)
  --data-dir <path>       data directory (default ~/LifeTracker, or the installed value)
  --public-origin <url>   extra allowed origin, e.g. https://mac.tail1.ts.net
  --dry-run               print the plist and the commands without executing anything
  -h, --help              show this help
`;

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const uid = process.getuid();
const target = `gui/${uid}/${LABEL}`;

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      'data-dir': { type: 'string' },
      'public-origin': { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (e) {
  console.error(e.message + '\n\n' + USAGE);
  process.exit(2);
}
const { values, positionals } = parsed;
const command = positionals[0];
const dryRun = values['dry-run'] === true;

if (values.help || !command) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 2);
}

const expandHome = (p) => (p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p);

function resolveOptions() {
  const existing = existsSync(plistPath) ? parsePlistOptions(readFileSync(plistPath, 'utf8')) : {};
  const port = Number(values.port ?? existing.port ?? 4280);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${values.port}`);
    process.exit(2);
  }
  return {
    label: LABEL,
    nodePath: process.execPath,
    repoDir,
    dataDir: resolve(expandHome(values['data-dir'] ?? existing.dataDir ?? '~/LifeTracker')),
    port,
    publicOrigin: values['public-origin'] ?? existing.publicOrigin,
  };
}

function launchctl(args, { ignoreErrors = false } = {}) {
  console.log(`$ launchctl ${args.join(' ')}`);
  if (dryRun) return '';
  try {
    return execFileSync('launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (ignoreErrors) return '';
    throw new Error(`launchctl ${args.join(' ')} failed: ${e.stderr || e.message}`);
  }
}

async function health(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tail(file, n) {
  try {
    return readFileSync(file, 'utf8').trimEnd().split('\n').slice(-n).join('\n');
  } catch {
    return '(no log output)';
  }
}

async function install() {
  const o = resolveOptions();
  const plist = renderPlist(o);
  if (dryRun) {
    console.log(`$ npm run build\n\nPlist (${plistPath}):\n${plist}`);
  } else {
    const build = spawnSync('npm', ['run', 'build'], { cwd: repoDir, stdio: 'inherit' });
    if (build.status !== 0) throw new Error('npm run build failed');
    mkdirSync(join(o.dataDir, 'logs'), { recursive: true });
    mkdirSync(dirname(plistPath), { recursive: true });
    writeFileSync(plistPath, plist);
  }
  launchctl(['bootout', target], { ignoreErrors: true });
  launchctl(['bootstrap', `gui/${uid}`, plistPath]);
  if (dryRun) return console.log(`(dry run) would poll http://127.0.0.1:${o.port}/api/health for up to 20 s`);
  for (let i = 0; i < 40; i++) {
    if (await health(o.port)) return console.log(`Life Tracker is running at http://127.0.0.1:${o.port}`);
    await sleep(500);
  }
  console.error(`Life Tracker did not become healthy. Last lines of launchd.err.log:\n${tail(join(o.dataDir, 'logs', 'launchd.err.log'), 20)}`);
  process.exitCode = 1;
}

function uninstall() {
  launchctl(['bootout', target], { ignoreErrors: true });
  console.log(`${dryRun ? '(dry run) would delete' : 'Deleting'} ${plistPath}`);
  if (!dryRun) rmSync(plistPath, { force: true });
}

async function status() {
  const out = launchctl(['print', target], { ignoreErrors: true });
  const o = resolveOptions();
  if (dryRun) return;
  const state = out.match(/^\s*state = (\S+)/m)?.[1];
  const pid = out.match(/^\s*pid = (\d+)/m)?.[1];
  const running = state === 'running' && pid !== undefined;
  console.log(running ? `Service: running (PID ${pid})` : out ? `Service: not running (state: ${state ?? 'unknown'})` : 'Service: not running (not loaded)');
  console.log(`Health (http://127.0.0.1:${o.port}/api/health): ${(await health(o.port)) ? 'ok' : 'unreachable'}`);
  if (!running) process.exitCode = 1;
}

function restart() {
  launchctl(['kickstart', '-k', target]);
}

const commands = { install, uninstall, status, restart };
if (!commands[command]) {
  console.error(`Unknown command: ${command}\n\n${USAGE}`);
  process.exit(2);
}
try {
  await commands[command]();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
