/**
 * Normalização das respostas da API do n8n para o formato de inventário.
 *
 * Puro e testável sem rede. Três responsabilidades:
 *
 * 1. Reduzir o workflow ao que o inventário precisa — o objeto completo traz
 *    todos os nós, com parâmetros que podem conter segredo.
 * 2. **Sanitizar webhooks.** A URL de um webhook do n8n costuma ser o próprio
 *    segredo: quem tem a URL dispara o fluxo. Guardamos o caminho, nunca o id.
 * 3. Classificar por cliente, sem inventar certeza.
 */

import type { VerificationStatus } from '../../../domain/src/verification.js';

export interface N8nWorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly isArchived: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly tags: readonly string[];
  readonly nodeCount: number;
  readonly triggerTypes: readonly string[];
  /** Caminho do webhook com o identificador mascarado. Nunca a URL completa. */
  readonly webhookPaths: readonly string[];
  readonly clientSlug: string | null;
  readonly clientConfidence: VerificationStatus;
  readonly hasWriteEffects: boolean;
}

export interface N8nCredentialSummary {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

/**
 * Nós que produzem efeito colateral externo.
 *
 * Serve para responder "quais automações podem gastar dinheiro, mandar mensagem
 * ou alterar sistema de cliente?" antes de qualquer integração de escrita.
 */
const WRITE_EFFECT_NODES = [
  /whatsapp/i, /evolution/i, /twilio/i,
  /emailSend|sendEmail|gmail|smtp/i,
  /slack|telegram|discord/i,
  /googleAds|facebookAds|meta/i,
  /httpRequest/i,
  /postgres|mysql|mongoDb|supabase/i,
  /executeCommand|ssh/i,
];

const TRIGGER_NODE = /trigger|webhook|cron|schedule|interval|pollingTrigger/i;

/**
 * Mascara o identificador do webhook, preservando a forma.
 *
 * `/webhook/abc123def456/lead` vira `/webhook/xxx/lead`. O inventário
 * registra que existe um webhook e qual o formato do caminho; quem quiser
 * dispará-lo precisa ir ao n8n.
 */
export function sanitizeWebhookPath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      segment.length >= 12 && /^[A-Za-z0-9_-]+$/.test(segment) ? '***' : segment,
    )
    .join('/');
}

export function parseWorkflow(raw: unknown): N8nWorkflowSummary {
  const w = (raw ?? {}) as Record<string, unknown>;
  const nodes = Array.isArray(w['nodes']) ? (w['nodes'] as Record<string, unknown>[]) : [];

  const nodeTypes = nodes.map((n) => str(n['type']));
  const triggerTypes = [...new Set(nodeTypes.filter((t) => TRIGGER_NODE.test(t)))];
  const hasWriteEffects = nodeTypes.some((t) => WRITE_EFFECT_NODES.some((re) => re.test(t)));

  const webhookPaths = nodes
    .filter((n) => /webhook/i.test(str(n['type'])))
    .map((n) => {
      const params = (n['parameters'] ?? {}) as Record<string, unknown>;
      return str(params['path']);
    })
    .filter(Boolean)
    .map(sanitizeWebhookPath);

  const tags = Array.isArray(w['tags'])
    ? (w['tags'] as unknown[])
        .map((t) => (typeof t === 'string' ? t : str((t as Record<string, unknown>)['name'])))
        .filter(Boolean)
    : [];

  const name = str(w['name']);
  return {
    id: str(w['id']),
    name,
    active: w['active'] === true,
    isArchived: w['isArchived'] === true,
    createdAt: str(w['createdAt']) || null,
    updatedAt: str(w['updatedAt']) || null,
    tags,
    nodeCount: nodes.length,
    triggerTypes,
    webhookPaths,
    // Nome e tags são pistas, não prova. Associação só entra após confirmação
    // do dono no arquivo de memória do cliente.
    clientSlug: null,
    clientConfidence: 'unknown',
    hasWriteEffects,
  };
}

export function parseWorkflows(raw: unknown): readonly N8nWorkflowSummary[] {
  const list = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>)['data'])
      ? ((raw as Record<string, unknown>)['data'] as unknown[])
      : [];
  return list.map(parseWorkflow);
}

/**
 * Credenciais: apenas id, nome e tipo.
 *
 * A API do n8n não devolve o valor cifrado nesta rota, mas a garantia não pode
 * depender disso — o campo `data` é descartado aqui, explicitamente.
 */
export function parseCredentials(raw: unknown): readonly N8nCredentialSummary[] {
  const list = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>)['data'])
      ? ((raw as Record<string, unknown>)['data'] as unknown[])
      : [];

  return list.map((item) => {
    const c = (item ?? {}) as Record<string, unknown>;
    return { id: str(c['id']), name: str(c['name']), type: str(c['type']) };
  });
}

export interface WorkflowStats {
  readonly total: number;
  readonly active: number;
  readonly inactive: number;
  readonly withWriteEffects: number;
  readonly withoutClient: number;
  readonly byClient: Readonly<Record<string, number>>;
}

export function summarize(workflows: readonly N8nWorkflowSummary[]): WorkflowStats {
  const byClient: Record<string, number> = {};
  for (const w of workflows) {
    const key = w.clientSlug ?? '(sem identificacao)';
    byClient[key] = (byClient[key] ?? 0) + 1;
  }

  return {
    total: workflows.length,
    active: workflows.filter((w) => w.active).length,
    inactive: workflows.filter((w) => !w.active).length,
    withWriteEffects: workflows.filter((w) => w.hasWriteEffects).length,
    withoutClient: workflows.filter((w) => w.clientSlug === null).length,
    byClient,
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
