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
export type MaskedPhone = string; // formato: "+55119****1234"

export function maskPhone(phone: string): MaskedPhone {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '****';
  const country = digits.slice(0, digits.length - 8);
  const visible = digits.slice(-4);
  const hiddenLength = digits.length - country.length - 4;
  return `+${country}${'*'.repeat(Math.max(hiddenLength, 4))}${visible}`;
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
