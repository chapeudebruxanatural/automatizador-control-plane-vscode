/**
 * Confirmação por código curto.
 *
 * Este módulo é o que separa "o dono mandou" de "aconteceu". Os testes cobrem
 * os caminhos que custam dinheiro quando falham: código de um plano confirmando
 * outro, código reutilizado, código vencido, e outra pessoa confirmando.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ConfirmationStore,
  deriveCode,
  CODE_LENGTH,
  DEFAULT_TTL_MS,
} from '../../packages/agent/src/confirmation.js';

const PEDIDO = {
  actionKind: 'google.campaign.budget',
  clientSlug: 'cassio-ferraz',
  summary: 'orçamento R$ 472,94 → R$ 500,00',
  payload: { campaignId: '24066140634', budgetBRL: 500 },
  requestedBy: '+55****11',
};

describe('formato do codigo', () => {
  it(`tem ${CODE_LENGTH} caracteres`, () => {
    const store = new ConfirmationStore();
    assert.equal(store.create(PEDIDO).code.length, CODE_LENGTH);
  });

  it('nao usa caracteres que se confundem ao digitar', () => {
    const store = new ConfirmationStore();
    for (let i = 0; i < 60; i += 1) {
      const code = store.create({ ...PEDIDO, payload: { n: i } }).code;
      assert.doesNotMatch(code, /[01OI]/, `codigo ambiguo: ${code}`);
    }
  });

  it('e deterministico para o mesmo plano e sal', () => {
    const a = deriveCode({ v: 1 }, 'k', 'cassio-ferraz', 'sal');
    const b = deriveCode({ v: 1 }, 'k', 'cassio-ferraz', 'sal');
    assert.equal(a, b);
  });

  it('muda quando o valor muda', () => {
    const a = deriveCode({ budgetBRL: 500 }, 'k', 'cassio-ferraz', 'sal');
    const b = deriveCode({ budgetBRL: 5000 }, 'k', 'cassio-ferraz', 'sal');
    assert.notEqual(a, b);
  });

  it('muda quando o CLIENTE muda, com o mesmo valor', () => {
    const a = deriveCode({ budgetBRL: 500 }, 'k', 'cassio-ferraz', 'sal');
    const b = deriveCode({ budgetBRL: 500 }, 'k', 'garbo-eventos', 'sal');
    assert.notEqual(a, b, 'codigo de um cliente confirmaria acao de outro');
  });

  it('dois pedidos identicos geram codigos diferentes', () => {
    // Senao um codigo antigo, ainda na tela, confirmaria um plano novo.
    const store = new ConfirmationStore();
    assert.notEqual(store.create(PEDIDO).code, store.create(PEDIDO).code);
  });
});

describe('confirmacao valida', () => {
  it('codigo certo confirma e devolve o plano', () => {
    const store = new ConfirmationStore();
    const pendente = store.create(PEDIDO);
    const r = store.confirm(pendente.code, PEDIDO.requestedBy);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.action.clientSlug, 'cassio-ferraz');
  });

  it('aceita minuscula e espaco em volta', () => {
    const store = new ConfirmationStore();
    const pendente = store.create(PEDIDO);
    const r = store.confirm(`  ${pendente.code.toLowerCase()} `, PEDIDO.requestedBy);
    assert.equal(r.ok, true);
  });
});

describe('recusa — onde o dinheiro e protegido', () => {
  it('codigo errado nao confirma', () => {
    const store = new ConfirmationStore();
    store.create(PEDIDO);
    const r = store.confirm('ZZZZZZ', PEDIDO.requestedBy);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, 'not_found');
  });

  it('codigo NAO se reaproveita', () => {
    const store = new ConfirmationStore();
    const pendente = store.create(PEDIDO);
    assert.equal(store.confirm(pendente.code, PEDIDO.requestedBy).ok, true);
    assert.equal(store.confirm(pendente.code, PEDIDO.requestedBy).ok, false);
  });

  it('codigo de um plano nao confirma outro', () => {
    const store = new ConfirmationStore();
    const barato = store.create(PEDIDO);
    store.create({ ...PEDIDO, payload: { campaignId: '24066140634', budgetBRL: 5000 } });

    const r = store.confirm(barato.code, PEDIDO.requestedBy);
    assert.equal(r.ok, true);
    assert.equal(
      r.ok && (r.action.payload as { budgetBRL: number }).budgetBRL,
      500,
      'confirmou o plano errado',
    );
  });

  it('codigo vencido nao confirma', () => {
    let agora = new Date('2026-08-05T12:00:00Z');
    const store = new ConfirmationStore({ ttlMs: 1000, now: () => agora });
    const pendente = store.create(PEDIDO);

    agora = new Date('2026-08-05T12:00:05Z');
    const r = store.confirm(pendente.code, PEDIDO.requestedBy);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, 'expired');
  });

  it('quem confirma tem de ser quem pediu', () => {
    const store = new ConfirmationStore();
    const pendente = store.create(PEDIDO);
    const r = store.confirm(pendente.code, '+55****99');
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, 'wrong_requester');
  });

  it('tentativa de outra pessoa consome o codigo', () => {
    // Senao o codigo continuaria valido depois de ter sido lido por terceiro.
    const store = new ConfirmationStore();
    const pendente = store.create(PEDIDO);
    store.confirm(pendente.code, '+55****99');
    assert.equal(store.confirm(pendente.code, PEDIDO.requestedBy).ok, false);
  });
});

describe('limpeza', () => {
  it('prune remove so o que venceu', () => {
    let agora = new Date('2026-08-05T12:00:00Z');
    const store = new ConfirmationStore({ ttlMs: 1000, now: () => agora });
    store.create(PEDIDO);
    agora = new Date('2026-08-05T12:00:05Z');
    store.create({ ...PEDIDO, payload: { novo: true } });

    assert.equal(store.prune(), 1);
    assert.equal(store.size, 1);
  });

  it('validade padrao e de minutos, nao de horas', () => {
    assert.ok(DEFAULT_TTL_MS <= 10 * 60 * 1000);
  });
});
