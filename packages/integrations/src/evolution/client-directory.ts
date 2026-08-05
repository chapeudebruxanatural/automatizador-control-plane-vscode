/**
 * Porta para os comandos de consulta que não mapeiam para uma ação de domínio
 * (clientes, projetos, riscos, pendências).
 *
 * Existe como porta separada, e não como leitura direta de arquivo dentro do
 * handler de comando, para manter o handler testável sem tocar em disco.
 *
 * A implementação real (lendo `clients/index.yaml` e os achados de
 * `inventory/`) ainda não foi construída — precisaria de um parser de YAML,
 * que não é dependência deste projeto. Documentado como pendência em
 * `docs/runbooks/whatsapp-homologation.md`, não fingido aqui como pronto.
 */

export interface ClientSummary {
  readonly slug: string;
  readonly name: string;
  readonly status: string;
}

export interface ProjectSummary {
  readonly slug: string;
  readonly clientSlug: string;
  readonly name: string;
}

export interface RiskSummary {
  readonly id: string;
  readonly severity: string;
  readonly title: string;
}

export interface ClientDirectoryProvider {
  listClients(): Promise<readonly ClientSummary[]>;
  listProjects(): Promise<readonly ProjectSummary[]>;
  listOpenRisks(): Promise<readonly RiskSummary[]>;
  listPendingItems(): Promise<readonly string[]>;
}

/** Devolve listas vazias de forma honesta — não inventa dado. */
export function createEmptyClientDirectory(): ClientDirectoryProvider {
  return {
    listClients: () => Promise.resolve([]),
    listProjects: () => Promise.resolve([]),
    listOpenRisks: () => Promise.resolve([]),
    listPendingItems: () => Promise.resolve([]),
  };
}

/** Para teste: dados fixos, sem tocar em arquivo. */
export function createStaticClientDirectory(data: {
  clients?: readonly ClientSummary[];
  projects?: readonly ProjectSummary[];
  risks?: readonly RiskSummary[];
  pending?: readonly string[];
}): ClientDirectoryProvider {
  return {
    listClients: () => Promise.resolve(data.clients ?? []),
    listProjects: () => Promise.resolve(data.projects ?? []),
    listOpenRisks: () => Promise.resolve(data.risks ?? []),
    listPendingItems: () => Promise.resolve(data.pending ?? []),
  };
}
