import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { parse as parseYaml } from 'yaml';

import { exportClientWorkspace } from '../packages/clients/src/workspace-export.js';

const root = resolve(import.meta.dirname, '..');

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'automatizador-workspace-'));
}

describe('workspace portátil por cliente', () => {
  it('gera instruções para diferentes IAs e contexto de um único cliente', async () => {
    const base = await temporaryDirectory();
    const destination = join(base, 'cassio');
    try {
      const result = await exportClientWorkspace({
        root,
        clientSlug: 'cassio-ferraz',
        destination,
        repository: 'dadocruz/cliente-cassio-ferraz-ops',
        generatedAt: '2026-08-09T12:00:00.000Z',
      });

      assert.ok(result.contextFiles.includes('profile.yaml'));
      assert.ok(result.contextFiles.includes('memory.yaml'));
      await readFile(join(destination, 'AGENTS.md'), 'utf8');
      await readFile(join(destination, 'CLAUDE.md'), 'utf8');
      await readFile(join(destination, '.github/copilot-instructions.md'), 'utf8');
      const handoff = await readFile(join(destination, 'HANDOFF.md'), 'utf8');
      assert.match(handoff, /Cassio Ferraz/);

      const manifest = parseYaml(await readFile(join(destination, 'CLIENTE.yaml'), 'utf8')) as {
        client?: { slug?: string };
        workspace?: { visibilityRequired?: string; repositoryVerificationStatus?: string };
        source?: { excludedSensitiveFiles?: readonly string[] };
      };
      assert.equal(manifest.client?.slug, 'cassio-ferraz');
      assert.equal(manifest.workspace?.visibilityRequired, 'private');
      assert.equal(manifest.workspace?.repositoryVerificationStatus, 'unknown');
      assert.deepEqual(manifest.source?.excludedSensitiveFiles, ['security.yaml']);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('nunca exporta security.yaml, mesmo para cliente que possui esse arquivo', async () => {
    const base = await temporaryDirectory();
    const destination = join(base, 'vivere');
    try {
      const result = await exportClientWorkspace({
        root,
        clientSlug: 'vivere',
        destination,
        generatedAt: '2026-08-09T12:00:00.000Z',
      });
      assert.ok(!result.contextFiles.includes('security.yaml'));
      await assert.rejects(readFile(join(destination, 'context/security.yaml')), /ENOENT/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('recusa cliente inexistente e destino não vazio', async () => {
    const base = await temporaryDirectory();
    try {
      await assert.rejects(
        exportClientWorkspace({
          root,
          clientSlug: 'cliente-inexistente',
          destination: join(base, 'inexistente'),
        }),
        /cliente não encontrado/,
      );

      const destination = join(base, 'ocupado');
      await mkdir(destination);
      await writeFile(join(destination, 'nao-apagar.txt'), 'preservar');
      await assert.rejects(
        exportClientWorkspace({ root, clientSlug: 'cassio-ferraz', destination }),
        /destino não está vazio/,
      );
      assert.equal(await readFile(join(destination, 'nao-apagar.txt'), 'utf8'), 'preservar');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('recusa referência de repositório ambígua', async () => {
    const base = await temporaryDirectory();
    try {
      await assert.rejects(
        exportClientWorkspace({
          root,
          clientSlug: 'cassio-ferraz',
          destination: join(base, 'cassio'),
          repository: 'sem-owner',
        }),
        /owner\/nome/,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
