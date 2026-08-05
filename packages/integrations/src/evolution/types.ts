/**
 * Tipos do módulo Evolution API (WhatsApp).
 *
 * MÓDULO EM HOMOLOGAÇÃO. Nenhum destes tipos autoriza envio de mensagem —
 * isso é decidido pelo executor de ações (kill switch + aprovação), não por
 * este arquivo. Ver `docs/architecture/whatsapp-evolution.md`.
 */

import type { VerificationStatus } from '../../../domain/src/verification.js';

/**
 * Número de telefone SEMPRE mascarado fora da fronteira de rede.
 * Nunca serializado, logado ou auditado em forma completa.
 */
export type MaskedPhone = string; // formato: "+55*********21"

/** Dígitos de código de país preservados, para dar contexto sem identificar. */
const COUNTRY_PREFIX_DIGITS = 2;
/** Dígitos finais preservados, para correlacionar duas linhas de log. */
const SUFFIX_DIGITS = 2;

/**
 * Mascara um telefone preservando o mínimo necessário para diagnóstico.
 *
 * Duas propriedades que a versão anterior não tinha, e que estão travadas por
 * teste:
 *
 * 1. **Revela menos do que esconde, sempre.** A implementação anterior
 *    preservava `length - 8` dígitos do início mais os 4 finais — o que, num
 *    número brasileiro de 13 dígitos, revelava 9 e escondia 4. Com 4 dígitos
 *    ocultos e o DDD visível, restam 10.000 possibilidades: isso identifica,
 *    não mascara.
 *
 * 2. **Não falha em entrada curta.** Com 6 dígitos, `slice(0, length - 8)`
 *    virava `slice(0, -2)` e devolvia os 4 primeiros; somados aos 4 últimos,
 *    os conjuntos se sobrepunham e cobriam o número inteiro — a saída era
 *    mais longa que a entrada e revelava tudo.
 *
 * A regra agora é aritmética simples: só preserva prefixo e sufixo se sobrar
 * pelo menos um dígito para esconder entre eles. Não sobrando, esconde tudo.
 */
export function maskPhone(phone: string): MaskedPhone {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '****';

  const keep = COUNTRY_PREFIX_DIGITS + SUFFIX_DIGITS;

  // Sem folga para ocultar nada no meio, oculta o número inteiro. Melhor
  // perder o diagnóstico que vazar o número.
  if (digits.length <= keep) return '*'.repeat(digits.length);

  const prefix = digits.slice(0, COUNTRY_PREFIX_DIGITS);
  const suffix = digits.slice(-SUFFIX_DIGITS);
  const hidden = digits.length - keep;

  return `+${prefix}${'*'.repeat(hidden)}${suffix}`;
}

export interface EvolutionInstanceSummary {
  readonly name: string;
  /** Nunca o número completo. */
  readonly maskedNumber: MaskedPhone | null;
  readonly status: 'open' | 'connecting' | 'close' | 'unknown';
  readonly verificationStatus: VerificationStatus;
}

export interface EvolutionHealth {
  readonly reachable: boolean;
  readonly version: string | null;
  readonly instanceCount: number;
  readonly checkedAt: string;
}

/**
 * Comandos de CONSULTA que o módulo WhatsApp aceita nesta fase.
 * Fechado de propósito — ver docs/runbooks/whatsapp-homologation.md.
 */
export const ALLOWED_QUERY_COMMANDS = [
  'status',
  'listar_clientes',
  'listar_projetos',
  'status_vps',
  'listar_repositorios',
  'status_n8n',
  'status_cloudflare',
  'listar_riscos',
  'listar_pendencias',
  'ajuda',
] as const;

export type QueryCommand = (typeof ALLOWED_QUERY_COMMANDS)[number];

export function isAllowedQueryCommand(value: string): value is QueryCommand {
  return (ALLOWED_QUERY_COMMANDS as readonly string[]).includes(value);
}

/**
 * Ações de ESCRITA que o desenho já contempla — todas recusadas nesta fase.
 * Listadas explicitamente para que "não implementado" e "não permitido"
 * fiquem no mesmo lugar: mesmo que alguém implemente o handler amanhã, a
 * classificação de que é escrita e proibida por padrão já existe aqui.
 */
export const PROHIBITED_WRITE_COMMANDS = [
  'criar_repositorio',
  'alterar_site',
  'fazer_deploy',
  'editar_dns',
  'executar_workflow',
  'ativar_campanha',
  'pausar_campanha',
  'enviar_mensagem_cliente',
  'excluir_recurso',
  'reiniciar_servico',
] as const;

export type ProhibitedWriteCommand = (typeof PROHIBITED_WRITE_COMMANDS)[number];

export interface IncomingWhatsAppMessage {
  readonly from: string; // número completo, nunca persistido nem logado assim
  readonly body: string;
  readonly messageId: string;
  readonly receivedAt: string;
}

export interface CommandRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly correlationId: string;
  readonly maskedFrom: MaskedPhone;
}

export interface CommandResponse {
  readonly ok: boolean;
  readonly text: string;
  readonly correlationId: string;
}
