import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createHandoffPacket,
  HandoffPacketError,
  type CreateHandoffPacketOptions,
} from '../src/handoff/packet.js';

const roots: string[] = [];

async function fixture(files: Record<string, string | Buffer>, metadata: CreateHandoffPacketOptions['project']['metadata'] = { kind: 'prototype', entryFile: 'index.html' }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'clean-design-packet-'));
  roots.push(root);
  const projectRoot = path.join(root, 'project');
  const trustedRoot = path.join(root, 'exports');
  await mkdir(projectRoot);
  await mkdir(trustedRoot);
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(projectRoot, ...name.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const options: CreateHandoffPacketOptions = {
    project: { id: 'project-1', name: 'Approved Product', metadata },
    projectRoot,
    trustedRoot,
    now: () => new Date('2026-08-09T12:34:56.000Z'),
    shortId: () => 'abcd1234',
    render: vi.fn(async (request) => Buffer.from(`${request.format}:${request.width}x${request.height}`)),
  };
  return {
    projectRoot,
    trustedRoot,
    options,
  };
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('immutable handoff packets', () => {
  it('creates deterministic HTML previews, hashes, and collision suffixes without overwriting', async () => {
    const { options } = await fixture({
      'index.html': '<!doctype html><h1>Approved</h1>',
      'DESIGN.md': '# Design system',
      'assets/logo.txt': 'logo',
    });
    const first = await createHandoffPacket(options);
    const firstManifest = await readFile(path.join(first.packetPath, 'manifest.json'), 'utf8');
    const second = await createHandoffPacket(options);
    expect(path.basename(first.packetPath)).toBe('20260809-123456-abcd1234');
    expect(path.basename(second.packetPath)).toBe('20260809-123456-abcd1234-2');
    expect(await readFile(path.join(first.packetPath, 'manifest.json'), 'utf8')).toBe(firstManifest);
    expect(first.manifest.schemaVersion).toBe(1);
    expect(first.manifest.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      'DESIGN.md',
      'HANDOFF.md',
      'previews/desktop.png',
      'previews/mobile.png',
      'source/index.html',
    ]));
    expect(first.prompt).toContain('Inspect the receiving repository before changing code');
    expect(first.prompt).not.toMatch(/Codex|Claude Code|OpenCode/);
  });

  it('aborts atomically when a required preview fails', async () => {
    const { options, trustedRoot } = await fixture({ 'index.html': '<!doctype html><h1>Broken</h1>' });
    options.render = async () => { throw new Error('capture failed'); };
    await expect(createHandoffPacket(options)).rejects.toMatchObject({ code: 'render_failed' });
    const projectDir = path.join(trustedRoot, 'approved-product');
    expect(await readdir(projectDir)).toEqual([]);
  });

  it('rejects secret filenames and high-confidence secret content before publication', async () => {
    const named = await fixture({ 'index.html': '<h1>ok</h1>', 'credentials.json': '{}' });
    await expect(createHandoffPacket(named.options)).rejects.toMatchObject({ code: 'secret_detected' });

    const content = await fixture({
      'index.html': '<h1>ok</h1>',
      'notes.txt': 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456',
    });
    await expect(createHandoffPacket(content.options)).rejects.toBeInstanceOf(HandoffPacketError);
  });

  it('creates deck requirements and records optional PPTX failure as a warning', async () => {
    const { options } = await fixture(
      { 'deck.html': '<!doctype html><section class="slide">One</section>' },
      { kind: 'deck', entryFile: 'deck.html' },
    );
    options.renderPptx = async () => { throw new Error('editable conversion unavailable'); };
    const result = await createHandoffPacket(options);
    expect(result.manifest.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      'previews/deck.pdf',
      'previews/cover.png',
    ]));
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'pptx_failed' }),
    ]);
  });

  it.each([
    ['image', 'art.png'],
    ['video', 'clip.mp4'],
    ['audio', 'sound.mp3'],
  ] as const)('includes required primary %s media', async (kind, filename) => {
    const { options } = await fixture({ [filename]: Buffer.from('binary-media') }, { kind });
    const result = await createHandoffPacket(options);
    expect(result.manifest.files.some((file) => file.path.startsWith('previews/primary.'))).toBe(true);
  });

  it('creates required document and brand previews', async () => {
    const document = await fixture({ 'report.md': '# Report' }, { kind: 'other', intent: 'document', entryFile: 'report.md' });
    const documentResult = await createHandoffPacket(document.options);
    expect(documentResult.manifest.files.some((file) => file.path === 'previews/document.pdf')).toBe(true);

    const brand = await fixture({ 'DESIGN.md': '# Brand tokens' }, { kind: 'brand', entryFile: 'DESIGN.md' });
    const brandResult = await createHandoffPacket(brand.options);
    expect(brandResult.manifest.files.some((file) => file.path === 'previews/brand.png')).toBe(true);
  });
});
