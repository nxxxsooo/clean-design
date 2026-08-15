#!/usr/bin/env node
/**
 * Deterministic local stand-in for Clean Design's five supported agent CLIs.
 * Wrappers in mocks/bin select the native stdout protocol. No network,
 * credentials, hosted recordings, or model tokens are involved.
 */

import { renderAsClaude } from './lib/format-claude.mjs';
import { renderAsCodex } from './lib/format-codex.mjs';
import { renderAsOpencode } from './lib/format-opencode.mjs';
import { renderAsPlain } from './lib/format-plain.mjs';
import { runPiRpcMock } from './lib/format-pi.mjs';

const SUPPORTED_AGENTS = new Set([
  'claude',
  'codex',
  'opencode',
  'antigravity',
  'pi',
]);

function parseArgs(argv) {
  const opts = { as: null, noDelay: false, reportFile: null, passthrough: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--as') {
      opts.as = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--no-delay') {
      opts.noDelay = true;
    } else if (arg === '--report-file') {
      opts.reportFile = argv[i + 1] ?? null;
      i += 1;
    } else {
      opts.passthrough.push(arg);
    }
  }
  if (process.env.CLEAN_DESIGN_MOCK_NO_DELAY === '1' || process.env.OD_MOCKS_NO_DELAY === '1') {
    opts.noDelay = true;
  }
  if (!opts.reportFile && process.env.REPORT_FILE) {
    opts.reportFile = process.env.REPORT_FILE;
  }
  return opts;
}

function emitProbeResult(agent, args) {
  if (args.includes('--version')) {
    process.stdout.write(`clean-design-${agent}-mock 1.0.0\n`);
    return true;
  }

  if (agent === 'claude' && args.includes('--help')) {
    process.stdout.write('--include-partial-messages\n--add-dir\n');
    return true;
  }

  if (agent === 'claude' && args[0] === 'auth' && args[1] === 'status') {
    process.stdout.write('authenticated\n');
    return true;
  }

  if (agent === 'codex' && args[0] === 'login' && args[1] === 'status') {
    process.stdout.write('authenticated\n');
    return true;
  }

  if (agent === 'codex' && args[0] === 'debug' && args[1] === 'models') {
    process.stdout.write(`${JSON.stringify({
      models: [{ slug: 'mock-model', display_name: 'Mock model' }],
    })}\n`);
    return true;
  }

  if (agent === 'opencode' && args[0] === 'models') {
    process.stdout.write('mock/mock-model\n');
    return true;
  }

  if (agent === 'pi' && args.includes('--list-models')) {
    process.stdout.write('Provider Model\nmock mock-model\n');
    return true;
  }

  return false;
}

function failUsage(message) {
  process.stderr.write(`mock-agent: ${message}\n`);
  process.exit(2);
}

async function readStdinIfPiped() {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let input = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(input);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    setTimeout(finish, 1500).unref();
  });
}

function fixtureEvents(agent) {
  const response = process.env.CLEAN_DESIGN_MOCK_RESPONSE
    ?? `Mock ${agent} response.`;
  return [
    {
      type: 'meta',
      agent,
      model: `mock/${agent}`,
      total_tokens: 1,
      duration_ms: 1,
    },
    {
      type: 'tool_call',
      obs_id: 'mock-tool-1',
      name: 'Read',
      input: { file_path: 'DESIGN.md' },
      t_ms: 0,
    },
    {
      type: 'tool_result',
      obs_id: 'mock-tool-1',
      status: 'success',
      output: 'Deterministic mock file content.',
      t_ms: 0,
    },
    { type: 'report', content: response, t_ms: 0 },
  ];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.as) {
    failUsage('--as <agent> required; supported: claude | codex | opencode | antigravity | pi');
  }
  if (!SUPPORTED_AGENTS.has(opts.as)) {
    failUsage(`unknown agent "${opts.as}"`);
  }

  if (emitProbeResult(opts.as, opts.passthrough)) return;

  if (opts.as === 'pi') {
    await runPiRpcMock({
      reportFile: opts.reportFile,
      responseText: process.env.CLEAN_DESIGN_MOCK_RESPONSE ?? 'Mock pi response.',
    });
    return;
  }

  await readStdinIfPiped();
  const events = fixtureEvents(opts.as);
  const renderOpts = { noDelay: opts.noDelay, reportFile: opts.reportFile };

  switch (opts.as) {
    case 'claude':
      await renderAsClaude(events, renderOpts);
      break;
    case 'codex':
      await renderAsCodex(events, renderOpts);
      break;
    case 'opencode':
      await renderAsOpencode(events, renderOpts);
      break;
    case 'antigravity':
      await renderAsPlain(events, renderOpts);
      break;
  }
}

main().catch((error) => {
  process.stderr.write(`mock-agent: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
