/**
 * Testes da redação.
 *
 * Os valores usados aqui são FALSOS e construídos para casar com os padrões.
 * Nenhum é credencial real.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { redact, redactString, isSensitiveKey, REDACTED } from '../packages/shared/src/redact.js';
import { createLogger } from '../packages/shared/src/logger.js';

// Construídos por concatenação para que o scanner de segredos do repositório
// não os confunda com credenciais reais no código-fonte.
const FAKE_GITHUB_TOKEN = 'ghp_' + 'A'.repeat(36);
const FAKE_GOOGLE_KEY = 'AIza' + 'B'.repeat(35);
const FAKE_DB_URL = 'postgres://app:' + 'senha123secreta' + '@10.0.0.5:5432/base';

describe('redação por nome de campo', () => {
  it('reconhece os nomes sensíveis usuais', () => {
    for (const key of [
      'password',
      'senha',
      'apiKey',
      'api_key',
      'accessToken',
      'client_secret',
      'refresh_token',
      'authorization',
      'privateKey',
      'cookie',
      'passphrase',
    ]) {
      assert.equal(isSensitiveKey(key), true, `deveria ser sensível: ${key}`);
    }
  });

  it('não marca nomes inocentes', () => {
    for (const key of ['id', 'name', 'status', 'count', 'clientSlug', 'updatedAt']) {
      assert.equal(isSensitiveKey(key), false, `não deveria ser sensível: ${key}`);
    }
  });

  it('substitui o valor sem alterar a chave', () => {
    const out = redact({ user: 'dado', password: 'qualquer-coisa' }) as Record<string, unknown>;
    assert.equal(out['user'], 'dado');
    assert.equal(out['password'], REDACTED);
  });

  it('alcança objetos aninhados', () => {
    const out = redact({
      integration: { name: 'n8n', config: { apiKey: 'valor-secreto' } },
    }) as Record<string, Record<string, Record<string, unknown>>>;

    assert.equal(out['integration']?.['name'], 'n8n');
    assert.equal(out['integration']?.['config']?.['apiKey'], REDACTED);
  });
});

describe('redação por formato do valor', () => {
  it('pega token do GitHub em campo de nome inocente', () => {
    const out = redact({ id: FAKE_GITHUB_TOKEN }) as Record<string, unknown>;
    assert.equal(out['id'], REDACTED);
  });

  it('pega chave de API do Google', () => {
    assert.equal(redactString(FAKE_GOOGLE_KEY), REDACTED);
  });

  it('apaga a credencial da URL de banco, preservando esquema e host', () => {
    const out = redactString(FAKE_DB_URL);

    // A credencial some...
    assert.doesNotMatch(out, /senha123secreta/);
    assert.doesNotMatch(out, /app:/);
    // ...mas continua dando para saber qual banco era, que é o que importa
    // numa mensagem de erro.
    assert.equal(out, `postgres://${REDACTED}@10.0.0.5:5432/base`);
  });

  it('apaga credencial em URL de qualquer esquema suportado', () => {
    for (const scheme of ['mysql', 'mongodb', 'redis', 'amqp', 'ssh']) {
      const out = redactString(`${scheme}://usuario:umaSenhaQualquer@host:1234/base`);
      assert.doesNotMatch(out, /umaSenhaQualquer/, `${scheme} não foi redigido`);
    }
  });

  it('pega chave privada em formato PEM', () => {
    const out = redactString('-----BEGIN RSA PRIVATE KEY-----\nMIIE...');
    assert.match(out, /\[REDACTED\]/);
  });

  it('preserva texto sem segredo', () => {
    const text = 'container novacena-motion reiniciado em 2026-08-04';
    assert.equal(redactString(text), text);
  });
});

describe('robustez', () => {
  it('lida com referência circular sem estourar a pilha', () => {
    const obj: Record<string, unknown> = { name: 'raiz' };
    obj['self'] = obj;

    const out = redact(obj) as Record<string, unknown>;
    assert.equal(out['name'], 'raiz');
    assert.equal(out['self'], '[Circular]');
  });

  it('redige dentro de arrays', () => {
    const out = redact([{ token: 'a' }, { name: 'b' }]) as Record<string, unknown>[];
    assert.equal(out[0]?.['token'], REDACTED);
    assert.equal(out[1]?.['name'], 'b');
  });

  it('redige mensagem e stack de Error', () => {
    const error = new Error(`falha ao autenticar com ${FAKE_GITHUB_TOKEN}`);
    const out = redact({ error }) as Record<string, Record<string, unknown>>;
    assert.match(String(out['error']?.['message']), /\[REDACTED\]/);
    assert.doesNotMatch(String(out['error']?.['message']), /ghp_/);
  });

  it('trunca aninhamento excessivo', () => {
    let deep: Record<string, unknown> = { value: 'fundo' };
    for (let i = 0; i < 20; i += 1) deep = { nested: deep };

    const serialized = JSON.stringify(redact(deep));
    assert.match(serialized, /\[Truncated\]/);
  });
});

describe('logger', () => {
  it('redige antes de escrever na saída', () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: 'info',
      service: 'test',
      sink: (line) => lines.push(line),
    });

    logger.info('autenticando', { token: FAKE_GITHUB_TOKEN, user: 'dado' });

    assert.equal(lines.length, 1);
    const line = lines[0] ?? '';
    assert.doesNotMatch(line, /ghp_/);
    assert.match(line, /\[REDACTED\]/);
    assert.match(line, /"user":"dado"/);
  });

  it('redige segredo que aparece na própria mensagem', () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: 'info',
      service: 'test',
      sink: (line) => lines.push(line),
    });

    logger.error(`falhou usando ${FAKE_GOOGLE_KEY}`);

    assert.doesNotMatch(lines[0] ?? '', /AIza/);
  });

  it('respeita o nível mínimo', () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: 'warn',
      service: 'test',
      sink: (line) => lines.push(line),
    });

    logger.debug('não deve aparecer');
    logger.info('não deve aparecer');
    logger.warn('deve aparecer');

    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /deve aparecer/);
  });

  it('herda os campos do logger filho', () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: 'info',
      service: 'test',
      sink: (line) => lines.push(line),
    }).child({ clientSlug: 'vivere' });

    logger.info('evento');

    assert.match(lines[0] ?? '', /"clientSlug":"vivere"/);
  });
});
