/**
 * Catálogo de capacidades.
 *
 * O teste que mais importa aqui é o último: uma ação mutante no domínio
 * declarada como `read` no catálogo executaria escrita sem confirmação. É o
 * tipo de divergência que passa em revisão de código e aparece na fatura.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  CapabilityCatalog,
  CapabilityViolationError,
  requiresConfirmation,
  isReachable,
} from '../../packages/agent/src/capability.js';
import type { ActionDefinition } from '../../packages/domain/src/action.js';

function catalogo(): CapabilityCatalog {
  return new CapabilityCatalog()
    .register({
      actionKind: 'google.campaign.report',
      tier: 'read',
      summaryTemplate: 'Relatório da campanha',
      viaWhatsApp: true,
    })
    .register({
      actionKind: 'google.campaign.pause',
      tier: 'reversible',
      summaryTemplate: 'Pausar campanha',
      viaWhatsApp: true,
    })
    .register({
      actionKind: 'google.campaign.budget',
      tier: 'costly',
      summaryTemplate: 'Alterar orçamento',
      viaWhatsApp: true,
    })
    .register({
      actionKind: 'vps.container.restart',
      tier: 'forbidden',
      summaryTemplate: 'Reiniciar container',
      viaWhatsApp: false,
    })
    .register({
      actionKind: 'clients.secrets.list',
      tier: 'read',
      summaryTemplate: 'Listar credenciais configuradas',
      viaWhatsApp: false,
    });
}

describe('escala de risco', () => {
  it('leitura nao pede confirmacao', () => {
    assert.equal(requiresConfirmation('read'), false);
  });

  it('escrita reversivel e cara pedem confirmacao', () => {
    assert.equal(requiresConfirmation('reversible'), true);
    assert.equal(requiresConfirmation('costly'), true);
  });

  it('proibida nao e alcancavel', () => {
    assert.equal(isReachable('forbidden'), false);
    assert.equal(isReachable('costly'), true);
  });
});

describe('autorizacao', () => {
  it('leitura passa direto', () => {
    const r = catalogo().authorize('google.campaign.report', 'whatsapp');
    assert.equal(r.needsConfirmation, false);
  });

  it('acao cara exige confirmacao', () => {
    const r = catalogo().authorize('google.campaign.budget', 'whatsapp');
    assert.equal(r.needsConfirmation, true);
  });

  it('acao NAO declarada e recusada — falha fechada', () => {
    assert.throws(
      () => catalogo().authorize('google.campaign.delete', 'whatsapp'),
      CapabilityViolationError,
    );
  });

  it('acao proibida e recusada mesmo fora do WhatsApp', () => {
    assert.throws(
      () => catalogo().authorize('vps.container.restart', 'any'),
      CapabilityViolationError,
    );
  });

  it('leitura sensivel nao vai para o WhatsApp, mas passa em outro canal', () => {
    assert.throws(
      () => catalogo().authorize('clients.secrets.list', 'whatsapp'),
      CapabilityViolationError,
    );
    assert.doesNotThrow(() => catalogo().authorize('clients.secrets.list', 'any'));
  });

  it('nao deixa declarar a mesma capacidade duas vezes', () => {
    const c = catalogo();
    assert.throws(() =>
      c.register({
        actionKind: 'google.campaign.budget',
        tier: 'read',
        summaryTemplate: 'duplicada',
        viaWhatsApp: true,
      }),
    );
  });
});

describe('catalogo oferecido ao modelo', () => {
  it('nao oferece proibida nem fora do canal', () => {
    const kinds = catalogo()
      .listForChannel('whatsapp')
      .map((c) => c.actionKind);
    assert.ok(!kinds.includes('vps.container.restart'));
    assert.ok(!kinds.includes('clients.secrets.list'));
    assert.ok(kinds.includes('google.campaign.budget'));
  });

  it('canal "any" ainda esconde as proibidas', () => {
    const kinds = catalogo()
      .listForChannel('any')
      .map((c) => c.actionKind);
    assert.ok(!kinds.includes('vps.container.restart'));
    assert.ok(kinds.includes('clients.secrets.list'));
  });
});

describe('coerencia com o dominio', () => {
  const definicao = (kind: string, mutating: boolean): ActionDefinition => ({
    kind,
    domain: 'google',
    description: kind,
    mutating,
    schema: z.object({}).strict(),
    handler: () => Promise.resolve({}),
  });

  it('aponta capacidade sem acao correspondente', () => {
    const problemas = catalogo().validateAgainst([definicao('google.campaign.report', false)]);
    assert.ok(problemas.some((p) => p.includes('google.campaign.budget')));
  });

  it('ACUSA acao mutante declarada como leitura', () => {
    const c = new CapabilityCatalog().register({
      actionKind: 'google.campaign.budget',
      tier: 'read',
      summaryTemplate: 'orçamento',
      viaWhatsApp: true,
    });
    const problemas = c.validateAgainst([definicao('google.campaign.budget', true)]);
    assert.equal(problemas.length, 1);
    assert.match(problemas[0] as string, /sem confirmação/);
  });

  it('catalogo coerente nao acusa nada', () => {
    const problemas = catalogo().validateAgainst([
      definicao('google.campaign.report', false),
      definicao('google.campaign.pause', true),
      definicao('google.campaign.budget', true),
      definicao('vps.container.restart', true),
      definicao('clients.secrets.list', false),
    ]);
    assert.deepEqual(problemas, []);
  });
});
