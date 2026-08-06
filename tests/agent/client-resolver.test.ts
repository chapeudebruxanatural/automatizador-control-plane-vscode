/**
 * O que está sendo testado aqui não é "acha o cliente certo" — é **recusa
 * quando não tem certeza**. Um resolvedor que acerta 90% das vezes e chuta os
 * outros 10% mexeria na conta do cliente errado uma vez a cada dez comandos.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveClient,
  normalizeTerm,
  describeResolution,
  MIN_PARTIAL_LENGTH,
  type KnownClient,
} from '../../packages/agent/src/client-resolver.js';

/** Espelha `clients/index.yaml`, incluindo as colisões reais da carteira. */
const CLIENTS: readonly KnownClient[] = [
  { slug: 'automatizadoria', name: 'AutomatizadorIA' },
  { slug: 'novacena', name: 'Novacena' },
  { slug: 'gaveta-producoes', name: 'Gaveta Producoes' },
  { slug: 'cassio-ferraz', name: 'Cassio Ferraz', aliases: ['cássio'] },
  { slug: 'garbo-eventos', name: 'Garbo Eventos' },
  { slug: 'vivere', name: 'Vivere' },
  { slug: 'soulraizes', name: 'Soulraizes' },
  { slug: 'chapeu-de-bruxa', name: 'Chapeu de Bruxa' },
];

describe('normalizacao', () => {
  it('ignora acento, caixa e separador', () => {
    assert.equal(normalizeTerm('Cássio Ferraz'), 'cassio-ferraz');
    assert.equal(normalizeTerm('cassio ferraz'), 'cassio-ferraz');
    assert.equal(normalizeTerm('CASSIO_FERRAZ'), 'cassio-ferraz');
    assert.equal(normalizeTerm('  cassio-ferraz  '), 'cassio-ferraz');
  });

  it('descarta pontuacao sem colar palavras', () => {
    assert.equal(normalizeTerm('Gaveta, Producoes!'), 'gaveta-producoes');
  });

  it('texto sem letra vira vazio', () => {
    assert.equal(normalizeTerm('!!!'), '');
    assert.equal(normalizeTerm('   '), '');
  });
});

describe('resolucao certa', () => {
  it('slug exato resolve', () => {
    const r = resolveClient('cassio-ferraz', CLIENTS);
    assert.equal(r.status, 'resolved');
    assert.equal(r.status === 'resolved' && r.via, 'slug');
  });

  it('nome com acento resolve', () => {
    const r = resolveClient('Cássio Ferraz', CLIENTS);
    assert.equal(r.status, 'resolved');
    assert.equal(r.status === 'resolved' && r.slug, 'cassio-ferraz');
  });

  it('apelido declarado resolve', () => {
    const r = resolveClient('cássio', CLIENTS);
    assert.equal(r.status, 'resolved');
    assert.equal(r.status === 'resolved' && r.via, 'name');
  });

  it('parcial que so casa com um resolve', () => {
    const r = resolveClient('vivere', CLIENTS);
    assert.equal(r.status, 'resolved');
    assert.equal(r.status === 'resolved' && r.slug, 'vivere');
  });
});

describe('recusa por ambiguidade — o ponto do modulo', () => {
  it('"ga" NAO resolve: casa com garbo e gaveta', () => {
    const r = resolveClient('ga', CLIENTS);
    assert.notEqual(r.status, 'resolved');
  });

  it('"gav" resolve para gaveta, "gar" para garbo', () => {
    const gav = resolveClient('gav', CLIENTS);
    const gar = resolveClient('gar', CLIENTS);
    assert.equal(gav.status === 'resolved' && gav.slug, 'gaveta-producoes');
    assert.equal(gar.status === 'resolved' && gar.slug, 'garbo-eventos');
  });

  it('"cas" nao alcanca chapeu-de-bruxa', () => {
    const r = resolveClient('cas', CLIENTS);
    assert.equal(r.status === 'resolved' && r.slug, 'cassio-ferraz');
  });

  it('devolve TODOS os candidatos, para o agente perguntar', () => {
    const r = resolveClient('produco', CLIENTS);
    // so gaveta contem "produco"
    assert.equal(r.status, 'resolved');

    const ambiguo = resolveClient('a', CLIENTS);
    assert.notEqual(ambiguo.status, 'resolved');
  });

  it('candidatos vem ordenados, para a resposta ser estavel', () => {
    const clientes: readonly KnownClient[] = [
      { slug: 'zeta-shows', name: 'Zeta' },
      { slug: 'alfa-shows', name: 'Alfa' },
    ];
    const r = resolveClient('shows', clientes);
    assert.equal(r.status, 'ambiguous');
    if (r.status === 'ambiguous') {
      assert.deepEqual([...r.candidates], ['alfa-shows', 'zeta-shows']);
    }
  });
});

describe('termos curtos e desconhecidos', () => {
  it(`termo com menos de ${MIN_PARTIAL_LENGTH} caracteres nao resolve por parcial`, () => {
    const r = resolveClient('vi', CLIENTS);
    assert.notEqual(r.status, 'resolved');
  });

  it('termo vazio nao resolve', () => {
    assert.equal(resolveClient('', CLIENTS).status, 'unknown');
    assert.equal(resolveClient('   ', CLIENTS).status, 'unknown');
  });

  it('cliente inexistente nao resolve', () => {
    assert.equal(resolveClient('fulano-de-tal', CLIENTS).status, 'unknown');
  });

  it('lista vazia nao resolve', () => {
    assert.equal(resolveClient('cassio-ferraz', []).status, 'unknown');
  });
});

describe('resposta ao dono', () => {
  it('ambiguidade lista os candidatos em vez de so recusar', () => {
    const r = resolveClient('ga', CLIENTS);
    const texto = describeResolution(r);
    assert.match(texto, /garbo-eventos/);
    assert.match(texto, /gaveta-producoes/);
  });

  it('resolucao mostra nome e slug', () => {
    const texto = describeResolution(resolveClient('cassio-ferraz', CLIENTS));
    assert.match(texto, /Cassio Ferraz/);
    assert.match(texto, /cassio-ferraz/);
  });
});
