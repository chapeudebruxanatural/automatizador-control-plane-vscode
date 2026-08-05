/**
 * Verificação de assinatura do webhook da Evolution API.
 *
 * Sem isso, qualquer request HTTP para o endpoint do webhook seria tratado
 * como mensagem legítima do WhatsApp — o segredo compartilhado é o que prova
 * que o evento veio da Evolution API de verdade, não de terceiro tentando
 * injetar comando.
 *
 * Comparação em tempo constante (`timingSafeEqual`): comparação ingênua
 * (`===`) vaza quanto do prefixo do token está correto pelo tempo de resposta,
 * o que permite descobrir o segredo byte a byte.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WebhookVerificationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | undefined,
  secret: string,
): WebhookVerificationResult {
  if (!secret) {
    return { valid: false, reason: 'webhook secret não configurado' };
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'assinatura ausente na requisição' };
  }

  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const provided = signatureHeader.replace(/^sha256=/, '');

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');

  if (expectedBuf.length !== providedBuf.length) {
    return { valid: false, reason: 'assinatura com tamanho inválido' };
  }

  const matches = timingSafeEqual(expectedBuf, providedBuf);
  return matches ? { valid: true } : { valid: false, reason: 'assinatura não confere' };
}
