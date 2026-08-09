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

/**
 * `frozen_by_owner` existe porque "não mexer" precisa ser estrutura, não memória.
 * Até 06/08 o Buteco só estava protegido por acidente — o ID dele não constava na
 * allowlist, então qualquer mutate falhava por campanha desconhecida. No dia em
 * que alguém preenchesse o ID (e ele está documentado no §8 do HANDOFF) a
 * proteção sumiria em silêncio, sem nenhum teste acusando.
 */
/**
 * `read_only_scope` existe porque auditar e poder alterar são coisas diferentes.
 *
 * Garbo e NovaCena precisam ser **legíveis** — cada um tem coluna de conversão
 * própria e o dono quer auditá-los lado a lado. Mas a restrição vigente é
 * explícita: *"não toque em nenhuma outra campanha"*. Deixá-los como
 * `active_scope` só para o leitor alcançá-los abriria escrita de brinde, e a
 * única barreira restante seria alguém lembrar de não usá-la.
 *
 * Diferente de `frozen_by_owner`, que descreve uma campanha específica que o
 * dono mandou congelar por um motivo específico. `read_only_scope` é o estado
 * normal de um cliente que ainda não foi autorizado para operação — o padrão,
 * não a exceção.
 */
export type CampaignLifecycle =
  | 'active_scope'
  | 'read_only_scope'
  | 'removed_by_owner'
  | 'frozen_by_owner'
  | 'discovery_by_name';

export interface AuthorizedCampaign {
  readonly campaignId: string | null;
  readonly clientSlug: string;
  readonly expectedName: string | null;
  readonly lifecycle: CampaignLifecycle;
  readonly notes: string;
}

/**
 * Campanhas dentro do escopo. Nada além disto é consultado.
 *
 * Até 06/08 Garbo e NovaCena ficavam de fora de propósito. Isso deixou de
 * servir quando cada cliente ganhou coluna de conversão própria: uma coluna de
 * auditoria que o control plane não consegue ler é auditoria que só existe na
 * interface. Eles entraram em 07/08 como `read_only_scope` — alcançáveis pelo
 * leitor, recusados pelo escritor.
 *
 * IDs colhidos dos `href` reais das linhas da interface, um a um. Uma primeira
 * tentativa inferiu a associação por proximidade no HTML e **errou três dos
 * cinco** nomes da Garbo. Ao adicionar campanha aqui, leia o ID do link da
 * própria linha; não deduza por vizinhança nem por sequência numérica.
 */
export const AUTHORIZED_CAMPAIGNS: readonly AuthorizedCampaign[] = [
  {
    campaignId: '24066140634',
    clientSlug: 'cassio-ferraz',
    expectedName: 'CASSIO | DEMAND_GEN | VIDEO_DVD | CONTRATANTES | BRASIL_PRIORITARIO',
    lifecycle: 'active_scope',
    notes:
      'PAUSADA em 06/08, substituída pela 24106867845. Orçamento CUSTOM_PERIOD de ' +
      'R$ 472,94 com R$ 276,95 não gastos — o saldo continua na conta e ela pode ser ' +
      'reativada até 09/08. Mantida no escopo para leitura do histórico: os 5 contatos ' +
      'de 29/07 estão aqui, e é contra eles que se compara o resultado da nova.',
  },
  {
    campaignId: '24106867845',
    clientSlug: 'cassio-ferraz',
    expectedName: 'CASSIO | DEMAND_GEN | VIDEO_DVD | CONTRATANTES | DIARIO',
    lifecycle: 'active_scope',
    notes:
      'Criada em 06/08 para substituir a 24066140634. Orçamento DIÁRIO de R$ 50, sem ' +
      'data de término — o cliente recarrega saldo na conta sem que a campanha precise ' +
      'ser editada, pausada ou reiniciada. Mesmo público, mesmos 5 vídeos, mesma ' +
      'landing. É esta que o monitor deve vigiar.',
  },
  {
    campaignId: '24105770570',
    clientSlug: 'buteco-sertanejo',
    expectedName: 'DG | Buteco Sertanejo | Shorts | Spotify',
    lifecycle: 'frozen_by_owner',
    notes:
      'ID confirmado em 06/08 na interface do Ads — antes constava como desconhecido. ' +
      'Anúncio 819900433355 REPROVADO por COPYRIGHTED_CONTENT, severidade ' +
      'FULLY_LIMITED. Instrução vigente do dono: NÃO MEXER. Leitura é permitida ' +
      '(para confirmar que segue parada); qualquer mutate é recusado em código. ' +
      'Não contestar, não editar anúncio, não substituir vídeo.',
  },
  // --- Garbo Eventos (Andréia) — 5 campanhas de Search ---
  //
  // Estado pretendido confirmado pelo dono em 09/08: as cinco ativas a R$ 6,
  // R$ 5, R$ 3, R$ 8 e R$ 12/dia. O lifecycle continua `read_only_scope`:
  // legibilidade não concede escrita ao adaptador.
  {
    campaignId: '24016194642',
    clientSlug: 'garbo-eventos',
    expectedName: 'GARBO | SEARCH | MOVEIS EVENTOS | CAMPINAS',
    lifecycle: 'read_only_scope',
    notes: 'Ativa desde 08/08, R$ 6/dia.',
  },
  {
    campaignId: '24016194645',
    clientSlug: 'garbo-eventos',
    expectedName: 'GARBO | SEARCH | MESAS CADEIRAS | CAMPINAS',
    lifecycle: 'read_only_scope',
    notes: 'Ativa desde 08/08, R$ 5/dia.',
  },
  {
    campaignId: '24016194648',
    clientSlug: 'garbo-eventos',
    expectedName: 'GARBO | SEARCH | PRODUTOS ESPECIFICOS | CAMPINAS',
    lifecycle: 'read_only_scope',
    notes: 'Ativa desde 08/08, R$ 3/dia.',
  },
  {
    campaignId: '24016194651',
    clientSlug: 'garbo-eventos',
    expectedName: 'GARBO | SEARCH | MARCA | CAMPINAS',
    lifecycle: 'read_only_scope',
    notes: 'Ativa por atualização pessoal do dono; intenção confirmada em 09/08, R$ 8/dia.',
  },
  {
    campaignId: '24016194654',
    clientSlug: 'garbo-eventos',
    expectedName: 'GARBO | SEARCH | CASAMENTOS EVENTOS | CAMPINAS',
    lifecycle: 'read_only_scope',
    notes: 'Ativa por atualização pessoal do dono; intenção confirmada em 09/08, R$ 12/dia.',
  },

  // --- NovaCena Motion (a produtora do próprio dono) — ambas pausadas ---
  //
  // Conta Google separada (`estudionovacena@gmail.com`), mas as campanhas vivem
  // na mesma conta de anúncios compartilhada. A separação de contas Google do
  // CLAUDE.md vale para arquivos, e-mail e agenda; aqui o isolamento é o mesmo
  // dos outros clientes, por campanha.
  {
    campaignId: '23956482634',
    clientSlug: 'novacena',
    expectedName: 'VÍDEO - NOVACENA MOTION',
    lifecycle: 'read_only_scope',
    notes: 'Pausada, R$ 100/dia. Todos os grupos de anúncios também pausados.',
  },
  {
    campaignId: '23951683643',
    clientSlug: 'novacena',
    expectedName: 'VENDAS - NOVACENA MOTION',
    lifecycle: 'read_only_scope',
    notes: 'Pausada, R$ 100/dia.',
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

/** Campanhas congeladas por instrução do dono. Leitura sim, escrita não. */
export function isFrozenByOwner(campaignId: string): boolean {
  const normalized = campaignId.replace(/\D/g, '');
  return AUTHORIZED_CAMPAIGNS.some(
    (c) => c.campaignId === normalized && c.lifecycle === 'frozen_by_owner',
  );
}

/**
 * Porta única de escrita: recusa qualquer campanha cujo ciclo de vida proíbe
 * mutate, seja qual for a operação.
 *
 * Existe como função separada porque a guarda estava só no plano de status —
 * o de orçamento não checava nada, e dava para alterar verba de campanha que o
 * dono tinha mandado remover. Guarda espalhada por chamador é guarda que um dia
 * alguém esquece de repetir.
 */
export function assertCampaignMutable(campaignId: string): void {
  const normalized = campaignId.replace(/\D/g, '');
  const campaign = AUTHORIZED_CAMPAIGNS.find((c) => c.campaignId === normalized);

  if (campaign?.lifecycle === 'removed_by_owner') {
    throw new ScopeViolationError(
      `campanha ${normalized} está marcada como removed_by_owner — não pode ser alterada nem reativada`,
    );
  }
  if (campaign?.lifecycle === 'frozen_by_owner') {
    throw new ScopeViolationError(
      `campanha ${normalized} está congelada por instrução do dono (frozen_by_owner) — leitura é permitida, alteração não`,
    );
  }
  if (campaign?.lifecycle === 'read_only_scope') {
    throw new ScopeViolationError(
      `campanha ${normalized} (${campaign.clientSlug}) está em read_only_scope — entrou para auditoria, ` +
        `não para operação. Para alterá-la, promova a entrada a active_scope com autorização explícita do dono.`,
    );
  }
}
