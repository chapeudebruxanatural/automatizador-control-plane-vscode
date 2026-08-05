/**
 * Testes da normalização do payload da Evolution API.
 *
 * As três defesas que este arquivo protege — descarte de `fromMe`, de grupo e
 * de evento que não é mensagem — não existiam na primeira versão do módulo.
 * Se algum destes testes quebrar, a proteção contra loop caiu junto.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEvolutionWebhook,
  jidToDigits,
  isGroupJid,
  isBroadcastJid,
  hasAcceptedJidDomain,
  extractText,
  REAL_PAYLOAD_VERIFIED,
} from '../../packages/integrations/src/evolution/normalize.js';

import {
  textMessage,
  extendedTextMessage,
  ownMessage,
  groupMessage,
  statusBroadcast,
  imageWithoutCaption,
  connectionUpdate,
  messagesUpdate,
  malformed,
  withoutMessageId,
  ALLOWED_NUMBER,
  ALLOWED_JID,
  ALLOWED_JID_WITH_DEVICE,
} from './fixtures/evolution-payloads.js';

describe('procedência do formato', () => {
  it('declara que o payload real ainda nao foi verificado', () => {
    // Guarda de honestidade: se alguém capturar uma amostra real e confirmar
    // o formato, este teste vira o lembrete de atualizar a flag.
    assert.equal(REAL_PAYLOAD_VERIFIED, false);
  });
});

describe('jidToDigits', () => {
  it('extrai o numero de um JID individual', () => {
    assert.equal(jidToDigits(ALLOWED_JID), ALLOWED_NUMBER);
  });

  it('ignora o sufixo de dispositivo (multi-device)', () => {
    // Sem isto, trocar de celular tiraria a pessoa da allowlist.
    assert.equal(jidToDigits(ALLOWED_JID_WITH_DEVICE), ALLOWED_NUMBER);
  });

  it('normaliza formatos diferentes para o mesmo numero', () => {
    const variants = [
      '5511999999999@s.whatsapp.net',
      '5511999999999:1@s.whatsapp.net',
      '+5511999999999@s.whatsapp.net',
      '55 11 99999-9999@s.whatsapp.net',
    ];
    for (const v of variants) {
      assert.equal(jidToDigits(v), ALLOWED_NUMBER, `falhou para ${v}`);
    }
  });

  it('devolve vazio para entrada sem digitos', () => {
    assert.equal(jidToDigits('@s.whatsapp.net'), '');
  });
});

describe('classificacao de JID', () => {
  it('reconhece grupo', () => {
    assert.equal(isGroupJid('120363000000000000@g.us'), true);
    assert.equal(isGroupJid(ALLOWED_JID), false);
  });

  it('reconhece broadcast e status', () => {
    assert.equal(isBroadcastJid('status@broadcast'), true);
    assert.equal(isBroadcastJid(ALLOWED_JID), false);
  });

  it('dominio e ALLOWLIST: aceita so o conhecido', () => {
    assert.equal(hasAcceptedJidDomain('5511999999999@s.whatsapp.net'), true);
    assert.equal(hasAcceptedJidDomain('5511999999999@c.us'), true);
  });

  it('dominio: recusa qualquer coisa nao prevista (falha fechada)', () => {
    // Regressão do MEDIUM-2. A versão anterior usava denylist e aceitava tudo
    // que não fosse @g.us ou @broadcast — inclusive @lid, cujo identificador
    // NAO e um telefone e poderia colidir com um numero da allowlist.
    for (const jid of [
      '5511999999999@lid',
      '5511999999999@newsletter',
      '5511999999999@qualquercoisa',
      '5511999999999', // sem dominio
      '',
    ]) {
      assert.equal(hasAcceptedJidDomain(jid), false, `aceitou indevidamente: "${jid}"`);
    }
  });
});

describe('extractText', () => {
  it('le conversation', () => {
    assert.equal(extractText({ conversation: 'oi' }), 'oi');
  });

  it('le extendedTextMessage.text', () => {
    assert.equal(extractText({ extendedTextMessage: { text: 'oi' } }), 'oi');
  });

  it('ignora legenda de imagem de proposito', () => {
    // Aceitar comando por legenda de midia amplia a superficie sem ganho.
    assert.equal(extractText({ imageMessage: { caption: 'status' } }), null);
  });

  it('trata texto vazio como ausente', () => {
    assert.equal(extractText({ conversation: '   ' }), null);
  });

  it('lida com message ausente', () => {
    assert.equal(extractText(undefined), null);
  });
});

describe('normalizeEvolutionWebhook — aceita', () => {
  it('mensagem de texto valida', () => {
    const result = normalizeEvolutionWebhook(textMessage());
    assert.equal(result.accepted, true);
    assert.equal(result.from, ALLOWED_NUMBER);
    assert.equal(result.text, 'ajuda');
    assert.equal(result.messageId, 'MSGID0000000000000001');
    assert.equal(result.instance, 'homologacao');
  });

  it('mensagem com extendedTextMessage', () => {
    const result = normalizeEvolutionWebhook(extendedTextMessage('status'));
    assert.equal(result.accepted, true);
    assert.equal(result.text, 'status');
  });

  it('numero com sufixo de dispositivo chega normalizado', () => {
    const result = normalizeEvolutionWebhook(textMessage({ jid: ALLOWED_JID_WITH_DEVICE }));
    assert.equal(result.accepted, true);
    assert.equal(result.from, ALLOWED_NUMBER);
  });
});

describe('normalizeEvolutionWebhook — recusa', () => {
  it('mensagem enviada pelo proprio numero (previne loop)', () => {
    const result = normalizeEvolutionWebhook(ownMessage());
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'from_self');
  });

  it('mensagem de grupo', () => {
    const result = normalizeEvolutionWebhook(groupMessage());
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'group_message');
  });

  it('status/broadcast', () => {
    const result = normalizeEvolutionWebhook(statusBroadcast());
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'broadcast_or_status');
  });

  it('imagem sem texto interpretavel', () => {
    const result = normalizeEvolutionWebhook(imageWithoutCaption());
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'no_text_content');
  });

  it('connection.update (nao e mensagem)', () => {
    const result = normalizeEvolutionWebhook(connectionUpdate());
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'not_a_message_event');
  });

  it('messages.update (confirmacao de entrega)', () => {
    const result = normalizeEvolutionWebhook(messagesUpdate());
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'not_a_message_event');
  });

  it('payload sem a estrutura esperada', () => {
    const result = normalizeEvolutionWebhook(malformed());
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'malformed');
  });

  it('mensagem sem id — deduplicacao seria impossivel', () => {
    const result = normalizeEvolutionWebhook(withoutMessageId());
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'malformed');
  });

  it('dominio nao suportado (@lid, @newsletter) no fluxo completo', () => {
    for (const jid of ['5511999999999@lid', '5511999999999@newsletter']) {
      const result = normalizeEvolutionWebhook(textMessage({ jid }));
      assert.equal(result.accepted, false, `aceitou ${jid}`);
      assert.equal(result.reason, 'unsupported_jid_domain');
    }
  });

  it('entrada que nao e objeto', () => {
    for (const input of [null, undefined, 'string', 42, []]) {
      const result = normalizeEvolutionWebhook(input);
      assert.equal(result.accepted, false, `aceitou ${JSON.stringify(input)}`);
    }
  });
});

describe('ordem das defesas', () => {
  it('fromMe e checado ANTES de grupo — eco em grupo nao vira group_message', () => {
    // A ordem importa para diagnostico: um eco do proprio numero dentro de um
    // grupo deve ser reportado como from_self, que e a causa raiz do loop,
    // e nao como group_message, que esconderia o problema real.
    const echoInGroup = textMessage({
      jid: '120363000000000000@g.us',
      fromMe: true,
      id: 'MSGID0000000000000099',
    });
    const result = normalizeEvolutionWebhook(echoInGroup);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'from_self');
  });
});
