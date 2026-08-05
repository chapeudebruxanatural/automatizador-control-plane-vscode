/**
 * Normalização do payload de webhook da Evolution API.
 *
 * ## Por que este arquivo existe
 *
 * A primeira versão do webhook lia `body.from`, `body.text` e `body.messageId`
 * do topo do payload — um formato que eu inventei para teste e que **não é o
 * que a Evolution API envia**. Com um número real conectado, aquele código
 * teria descartado toda mensagem legítima (campos ausentes → 400) e, pior,
 * não tinha nenhuma das três defesas abaixo.
 *
 * ## As três defesas que faltavam
 *
 * 1. **`fromMe`** — a Evolution reenvia as mensagens que o próprio número
 *    envia. Sem descartar essas, um bot que responde a si mesmo entra em loop
 *    infinito no instante em que o envio for habilitado. Esta é a razão de
 *    `fromMe` ser checado antes de qualquer outra coisa.
 * 2. **Grupos** (`@g.us`) — comandos administrativos não têm o que fazer em
 *    grupo, e um grupo pode ter participantes fora da allowlist.
 * 3. **Tipo de evento** — a Evolution emite `connection.update`,
 *    `messages.update`, `presence.update` e vários outros. Só
 *    `messages.upsert` carrega mensagem nova.
 *
 * ## Procedência deste formato
 *
 * `realPayloadVerified: false` — ver `REAL_PAYLOAD_VERIFIED` abaixo. O formato
 * aqui vem da documentação da Evolution API v2 (Baileys), **não** de uma
 * amostra capturada da instância que roda na VPS. Nenhuma conversa foi lida
 * para construir isto.
 */

/**
 * Nenhuma amostra real da instância em produção foi capturada — fazê-lo
 * exigiria ler tráfego de conversa, que está fora de escopo. O formato foi
 * derivado da documentação. Antes de conectar um número real, capture um
 * evento sanitizado e confirme os caminhos de campo.
 */
export const REAL_PAYLOAD_VERIFIED = false;

export type RejectReason =
  | 'not_a_message_event'
  | 'from_self'
  | 'group_message'
  | 'broadcast_or_status'
  | 'no_text_content'
  | 'malformed';

export interface NormalizedIncoming {
  readonly accepted: boolean;
  readonly reason?: RejectReason;
  /** Somente dígitos, sem sufixo de dispositivo nem domínio. */
  readonly from?: string;
  readonly text?: string;
  readonly messageId?: string;
  readonly instance?: string;
}

const MESSAGE_EVENTS = new Set(['messages.upsert']);

/**
 * Extrai o número de um JID do WhatsApp.
 *
 * Formatos reais: `5511999999999@s.whatsapp.net`, e com sufixo de dispositivo
 * `5511999999999:12@s.whatsapp.net`. O sufixo muda quando o usuário conecta
 * outro aparelho — ignorá-lo é o que faz a allowlist continuar funcionando
 * depois que a pessoa troca de celular.
 */
export function jidToDigits(jid: string): string {
  const beforeDomain = jid.split('@')[0] ?? '';
  const beforeDevice = beforeDomain.split(':')[0] ?? '';
  return beforeDevice.replace(/\D/g, '');
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

export function isBroadcastJid(jid: string): boolean {
  return jid.endsWith('@broadcast') || jid === 'status@broadcast';
}

/**
 * Texto da mensagem, que a Evolution entrega em lugares diferentes conforme
 * o tipo.
 *
 * `conversation` é a mensagem simples; `extendedTextMessage.text` é a que tem
 * link, menção ou citação. Legenda de mídia (`imageMessage.caption`) é
 * **deliberadamente ignorada**: aceitar comando por legenda de imagem amplia
 * a superfície sem necessidade nenhuma nesta fase.
 */
export function extractText(message: Record<string, unknown> | undefined): string | null {
  if (message === undefined || message === null) return null;

  const conversation = message['conversation'];
  if (typeof conversation === 'string' && conversation.trim() !== '') return conversation;

  const extended = message['extendedTextMessage'];
  if (extended !== null && typeof extended === 'object') {
    const text = (extended as Record<string, unknown>)['text'];
    if (typeof text === 'string' && text.trim() !== '') return text;
  }

  return null;
}

/**
 * Converte o payload bruto da Evolution em algo que o módulo aceita — ou
 * explica por que recusou.
 *
 * Recusa não é erro: `connection.update` chegando é comportamento normal da
 * Evolution, não um problema. Por isso o retorno é um resultado com motivo, e
 * não uma exceção.
 */
export function normalizeEvolutionWebhook(raw: unknown): NormalizedIncoming {
  if (raw === null || typeof raw !== 'object') {
    return { accepted: false, reason: 'malformed' };
  }

  const payload = raw as Record<string, unknown>;
  const event = typeof payload['event'] === 'string' ? payload['event'] : '';
  const instance = typeof payload['instance'] === 'string' ? payload['instance'] : undefined;

  if (!MESSAGE_EVENTS.has(event)) {
    return {
      accepted: false,
      reason: 'not_a_message_event',
      ...(instance === undefined ? {} : { instance }),
    };
  }

  const data = payload['data'];
  if (data === null || typeof data !== 'object') {
    return { accepted: false, reason: 'malformed', ...(instance === undefined ? {} : { instance }) };
  }

  const dataObj = data as Record<string, unknown>;
  const key = dataObj['key'];
  if (key === null || typeof key !== 'object') {
    return { accepted: false, reason: 'malformed', ...(instance === undefined ? {} : { instance }) };
  }

  const keyObj = key as Record<string, unknown>;

  // 1. Loop: a Evolution reenvia o que o próprio número manda. Primeiro
  //    portão, antes de qualquer outra validação.
  if (keyObj['fromMe'] === true) {
    return { accepted: false, reason: 'from_self', ...(instance === undefined ? {} : { instance }) };
  }

  const remoteJid = typeof keyObj['remoteJid'] === 'string' ? keyObj['remoteJid'] : '';
  if (remoteJid === '') {
    return { accepted: false, reason: 'malformed', ...(instance === undefined ? {} : { instance }) };
  }

  // 2. Grupo: comando administrativo não opera em grupo, e grupo pode ter
  //    participante fora da allowlist.
  if (isGroupJid(remoteJid)) {
    return { accepted: false, reason: 'group_message', ...(instance === undefined ? {} : { instance }) };
  }

  // 3. Status/broadcast: não é conversa dirigida.
  if (isBroadcastJid(remoteJid)) {
    return {
      accepted: false,
      reason: 'broadcast_or_status',
      ...(instance === undefined ? {} : { instance }),
    };
  }

  const message = dataObj['message'];
  const text = extractText(
    message !== null && typeof message === 'object' ? (message as Record<string, unknown>) : undefined,
  );

  // 4. Mídia sem legenda aceita, reação, edição, etc. — nada a interpretar.
  if (text === null) {
    return { accepted: false, reason: 'no_text_content', ...(instance === undefined ? {} : { instance }) };
  }

  const messageId = typeof keyObj['id'] === 'string' ? keyObj['id'] : '';
  if (messageId === '') {
    // Sem id estável não há deduplicação possível. Recusar é melhor que
    // inventar um id, que faria toda reentrega virar mensagem nova.
    return { accepted: false, reason: 'malformed', ...(instance === undefined ? {} : { instance }) };
  }

  const from = jidToDigits(remoteJid);
  if (from === '') {
    return { accepted: false, reason: 'malformed', ...(instance === undefined ? {} : { instance }) };
  }

  return {
    accepted: true,
    from,
    text,
    messageId,
    ...(instance === undefined ? {} : { instance }),
  };
}
