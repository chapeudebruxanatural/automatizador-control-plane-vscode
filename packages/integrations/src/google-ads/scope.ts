/**
 * Escopo autorizado das consultas ao Google Ads.
 *
 * A conta anunciante `2656966896` é **compartilhada entre vários clientes** —
 * o isolamento é por campanha, não por conta. Não há barreira estrutural na
 * plataforma impedindo que uma consulta traga dados do cliente errado.
 *
 * Este arquivo é essa barreira, do nosso lado: uma allowlist explícita de
 * conta e de campanha, com o cliente dono declarado em cada entrada. Consulta
 * fora dela é recusada antes de virar chamada de rede.
 */

export const AUTHORIZED_CUSTOMER_ID = '2656966896';
export const AUTHORIZED_LOGIN_CUSTOMER_ID = '3992594849';

export type CampaignLifecycle = 'active_scope' | 'removed_by_owner' | 'discovery_by_name';

export interface AuthorizedCampaign {
  readonly campaignId: string | null;
  readonly clientSlug: string;
  readonly expectedName: string | null;
  readonly lifecycle: CampaignLifecycle;
  readonly notes: string;
}

/**
 * Campanhas dentro do escopo deste ciclo. Nada além disto é consultado.
 *
 * Garbo, NovaCena e demais recursos ficam **de fora de propósito**: não estão
 * no escopo autorizado, então uma consulta a eles é erro de programa, não
 * decisão de runtime.
 */
export const AUTHORIZED_CAMPAIGNS: readonly AuthorizedCampaign[] = [
  {
    campaignId: '24066140634',
    clientSlug: 'cassio-ferraz',
    expectedName: 'CASSIO | DEMAND_GEN | VIDEO_DVD | CONTRATANTES | BRASIL_PRIORITARIO',
    lifecycle: 'active_scope',
    notes:
      'Demand Gen nacional prioritária. O conflito de verba do Cássio NÃO bloqueia ' +
      'leitura — bloqueia reativação, aumento de orçamento, publicação, nova verba e ' +
      'qualquer mutate.',
  },
  {
    campaignId: null,
    clientSlug: 'buteco-sertanejo',
    expectedName: 'DG | Buteco Sertanejo | Shorts | Spotify',
    lifecycle: 'discovery_by_name',
    notes:
      'ID desconhecido: localizar por correspondência EXATA do nome. Há reprovação ' +
      'por direitos autorais a verificar. Não contestar, não editar anúncio, não ' +
      'substituir vídeo.',
  },
  {
    campaignId: '24079586567',
    clientSlug: 'gaveta-producoes',
    expectedName: null,
    lifecycle: 'removed_by_owner',
    notes:
      'Removida pelo dono. Registrar como removed_by_owner. Não reativar, não ' +
      'monitorar como campanha ativa, não recriar.',
  },
];

export class ScopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeViolationError';
  }
}

/** Normaliza `399-259-4849` e `customers/3992594849` para `3992594849`. */
export function normalizeCustomerId(raw: string): string {
  return raw.replace(/^customers\//, '').replace(/\D/g, '');
}

/**
 * Recusa qualquer conta que não seja a autorizada.
 *
 * Fecha por padrão: só o identificador exato passa. Um erro de digitação em um
 * dígito não vira consulta à conta de outro anunciante.
 */
export function assertAuthorizedCustomer(customerId: string): string {
  const normalized = normalizeCustomerId(customerId);
  if (normalized !== AUTHORIZED_CUSTOMER_ID) {
    throw new ScopeViolationError(
      `conta ${normalized} fora do escopo autorizado (esperado ${AUTHORIZED_CUSTOMER_ID})`,
    );
  }
  return normalized;
}

/** Recusa campanha fora da allowlist, e diz de quem ela é quando aceita. */
export function assertAuthorizedCampaign(campaignId: string): AuthorizedCampaign {
  const normalized = campaignId.replace(/\D/g, '');
  const found = AUTHORIZED_CAMPAIGNS.find((c) => c.campaignId === normalized);
  if (found === undefined) {
    throw new ScopeViolationError(
      `campanha ${normalized} fora do escopo autorizado deste ciclo`,
    );
  }
  return found;
}

/**
 * Recusa campanha que existe na allowlist mas pertence a outro cliente.
 *
 * Existe porque a conta é compartilhada: pedir a campanha do Cássio declarando
 * `gaveta-producoes` é exatamente o erro que vazaria dado entre clientes, e é
 * um erro que passa despercebido se ninguém checar.
 */
export function assertCampaignBelongsTo(campaignId: string, clientSlug: string): AuthorizedCampaign {
  const campaign = assertAuthorizedCampaign(campaignId);
  if (campaign.clientSlug !== clientSlug) {
    throw new ScopeViolationError(
      `campanha ${campaignId} pertence a "${campaign.clientSlug}", não a "${clientSlug}"`,
    );
  }
  return campaign;
}

/** Campanhas que não devem ser tratadas como ativas. */
export function isRemovedByOwner(campaignId: string): boolean {
  const normalized = campaignId.replace(/\D/g, '');
  return AUTHORIZED_CAMPAIGNS.some(
    (c) => c.campaignId === normalized && c.lifecycle === 'removed_by_owner',
  );
}
