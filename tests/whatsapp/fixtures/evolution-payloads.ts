/**
 * Fixtures sanitizadas de webhook da Evolution API.
 *
 * TODAS SÃO SINTÉTICAS. Nenhuma foi capturada de tráfego real — nenhuma
 * conversa foi lida para construí-las. Os números são de faixa de teste, os
 * ids de mensagem são inventados, e não há token, apikey nem QR code.
 *
 * O formato segue a documentação da Evolution API v2 (Baileys).
 * `REAL_PAYLOAD_VERIFIED` em `normalize.ts` é `false` justamente porque estas
 * fixtures vêm de documentação, não de amostra da instância em produção.
 * Se um evento real vier a divergir, é aqui que a correção entra primeiro.
 */

export const INSTANCE = 'homologacao';

/** Número autorizado nos testes. Faixa fictícia. */
export const ALLOWED_NUMBER = '5511999999999';
export const ALLOWED_JID = `${ALLOWED_NUMBER}@s.whatsapp.net`;

/** Mesmo número, com sufixo de dispositivo — acontece com multi-device real. */
export const ALLOWED_JID_WITH_DEVICE = `${ALLOWED_NUMBER}:12@s.whatsapp.net`;

/** Número fora da allowlist. */
export const FOREIGN_NUMBER = '5511000000000';
export const FOREIGN_JID = `${FOREIGN_NUMBER}@s.whatsapp.net`;

interface BuildOptions {
  readonly jid?: string;
  readonly fromMe?: boolean;
  readonly id?: string;
  readonly text?: string;
  readonly event?: string;
}

/** Mensagem de texto simples (`conversation`). */
export function textMessage(options: BuildOptions = {}): Record<string, unknown> {
  return {
    event: options.event ?? 'messages.upsert',
    instance: INSTANCE,
    data: {
      key: {
        remoteJid: options.jid ?? ALLOWED_JID,
        fromMe: options.fromMe ?? false,
        id: options.id ?? 'MSGID0000000000000001',
      },
      pushName: 'Operador Teste',
      message: { conversation: options.text ?? 'ajuda' },
      messageType: 'conversation',
      messageTimestamp: 1785900000,
    },
    destination: 'https://example.invalid/webhook',
    date_time: '2026-08-05T08:00:00.000Z',
    sender: ALLOWED_JID,
    server_url: 'https://example.invalid',
  };
}

/** Texto com link/menção — a Evolution usa `extendedTextMessage`. */
export function extendedTextMessage(text = 'status'): Record<string, unknown> {
  return {
    event: 'messages.upsert',
    instance: INSTANCE,
    data: {
      key: { remoteJid: ALLOWED_JID, fromMe: false, id: 'MSGID0000000000000002' },
      pushName: 'Operador Teste',
      message: { extendedTextMessage: { text } },
      messageType: 'extendedTextMessage',
      messageTimestamp: 1785900001,
    },
  };
}

/** Eco da própria mensagem enviada pelo número conectado — risco de loop. */
export function ownMessage(): Record<string, unknown> {
  return textMessage({ fromMe: true, id: 'MSGID0000000000000003', text: 'ajuda' });
}

/** Mensagem vinda de um grupo. */
export function groupMessage(): Record<string, unknown> {
  return textMessage({
    jid: '120363000000000000@g.us',
    id: 'MSGID0000000000000004',
    text: 'ajuda',
  });
}

/** Atualização de status/stories — não é conversa dirigida. */
export function statusBroadcast(): Record<string, unknown> {
  return textMessage({ jid: 'status@broadcast', id: 'MSGID0000000000000005' });
}

/** Imagem sem legenda: evento de mensagem, mas sem texto para interpretar. */
export function imageWithoutCaption(): Record<string, unknown> {
  return {
    event: 'messages.upsert',
    instance: INSTANCE,
    data: {
      key: { remoteJid: ALLOWED_JID, fromMe: false, id: 'MSGID0000000000000006' },
      pushName: 'Operador Teste',
      message: {
        imageMessage: {
          mimetype: 'image/jpeg',
          fileLength: '12345',
          // Legenda existe no formato real, mas é ignorada de propósito —
          // ver extractText() em normalize.ts.
          caption: 'status',
        },
      },
      messageType: 'imageMessage',
      messageTimestamp: 1785900002,
    },
  };
}

/** Evento que não é mensagem — a Evolution emite vários destes. */
export function connectionUpdate(): Record<string, unknown> {
  return {
    event: 'connection.update',
    instance: INSTANCE,
    data: { state: 'open', statusReason: 200 },
  };
}

/** Confirmação de entrega/leitura. */
export function messagesUpdate(): Record<string, unknown> {
  return {
    event: 'messages.update',
    instance: INSTANCE,
    data: { keyId: 'MSGID0000000000000001', status: 'DELIVERY_ACK' },
  };
}

/** Payload sem a estrutura esperada. */
export function malformed(): Record<string, unknown> {
  return { event: 'messages.upsert', instance: INSTANCE, data: { semChave: true } };
}

/** Mensagem sem id — impossível deduplicar. */
export function withoutMessageId(): Record<string, unknown> {
  const payload = textMessage() as Record<string, unknown>;
  const data = payload['data'] as Record<string, unknown>;
  const key = data['key'] as Record<string, unknown>;
  delete key['id'];
  return payload;
}
