/**
 * Resolve texto livre para o slug canônico de um cliente.
 *
 * É a primeira coisa que acontece com uma mensagem de WhatsApp e a mais fácil
 * de errar em silêncio. "sobe a campanha do ga..." casa com `garbo-eventos` e
 * com `gaveta-producoes`; "chama o ca" casa com `cassio-ferraz` e com
 * `chapeu-de-bruxa`. Resolver para o primeiro da lista significaria mexer na
 * conta do cliente errado.
 *
 * Por isso a regra aqui não é "achar o mais provável" — é **recusar quando há
 * mais de um**. Ambiguidade devolve os candidatos para o agente perguntar, e
 * perguntar custa uma mensagem. Adivinhar custa a conta de um cliente.
 *
 * Implementa em código a regra do CLAUDE.md: se a associação não for certa,
 * não adivinhe.
 */

/** Cliente conhecido, como aparece em `clients/index.yaml`. */
export interface KnownClient {
  readonly slug: string;
  readonly name: string;
  /** Apelidos aceitos. Vêm do perfil do cliente, nunca de texto observado. */
  readonly aliases?: readonly string[];
}

export type ResolutionKind =
  /** Casou exatamente com o slug. */
  | 'slug'
  /** Casou exatamente com o nome ou um apelido declarado. */
  | 'name'
  /** Um único cliente contém o termo. */
  | 'unique_partial';

export interface ResolvedClient {
  readonly status: 'resolved';
  readonly slug: string;
  readonly name: string;
  /** Como foi resolvido. Vai para a auditoria: nem toda resolução é igual. */
  readonly via: ResolutionKind;
  /** Termo que produziu o casamento, já normalizado. */
  readonly matched: string;
}

export interface AmbiguousClient {
  readonly status: 'ambiguous';
  /** Slugs candidatos, em ordem alfabética. O agente deve perguntar. */
  readonly candidates: readonly string[];
  readonly term: string;
}

export interface UnknownClient {
  readonly status: 'unknown';
  readonly term: string;
}

export type ClientResolution = ResolvedClient | AmbiguousClient | UnknownClient;

/**
 * Normaliza para comparação: minúsculas, sem acento, separadores unificados.
 *
 * "Cássio Ferraz", "cassio ferraz" e "cassio-ferraz" precisam colidir — quem
 * digita no celular não acentua nem lembra do hífen.
 */
export function normalizeTerm(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Termos curtos demais não resolvem por prefixo.
 *
 * Com dois caracteres, "ga" e "ca" casam com dois clientes cada. Mesmo quando
 * casassem com um só, resolver a conta de um cliente por duas letras é frágil
 * demais para valer o risco — basta um cliente novo entrar na carteira para a
 * mesma mensagem passar a significar outra coisa.
 */
export const MIN_PARTIAL_LENGTH = 3;

export function resolveClient(
  term: string,
  clients: readonly KnownClient[],
): ClientResolution {
  const needle = normalizeTerm(term);
  if (needle === '') return { status: 'unknown', term };

  // 1. Slug exato. Não há como ser ambíguo: slug é chave.
  const bySlug = clients.find((c) => normalizeTerm(c.slug) === needle);
  if (bySlug !== undefined) {
    return { status: 'resolved', slug: bySlug.slug, name: bySlug.name, via: 'slug', matched: needle };
  }

  // 2. Nome ou apelido exato. Pode empatar, e empate aqui também é recusa.
  const byName = clients.filter(
    (c) =>
      normalizeTerm(c.name) === needle ||
      (c.aliases ?? []).some((a) => normalizeTerm(a) === needle),
  );
  if (byName.length === 1) {
    const hit = byName[0] as KnownClient;
    return { status: 'resolved', slug: hit.slug, name: hit.name, via: 'name', matched: needle };
  }
  if (byName.length > 1) {
    return { status: 'ambiguous', candidates: sortSlugs(byName), term };
  }

  // 3. Parcial. Só resolve se sobrar exatamente um candidato.
  const partial = clients.filter((c) => {
    const haystack = [c.slug, c.name, ...(c.aliases ?? [])].map(normalizeTerm);
    return haystack.some((h) => h.includes(needle));
  });

  // A ambiguidade é apurada ANTES da guarda de tamanho, de propósito.
  //
  // "ga" tem dois caracteres e casa com garbo-eventos e gaveta-producoes. As
  // duas ordens recusam — mas só esta consegue dizer por quê. Responder "não
  // reconheci ga" seria falso: o problema não é que o termo é desconhecido, é
  // que ele serve para dois clientes. Listar os candidatos economiza uma volta
  // de conversa e não afrouxa nada.
  if (partial.length > 1) {
    return { status: 'ambiguous', candidates: sortSlugs(partial), term };
  }

  // Candidato único ainda precisa passar do tamanho mínimo: resolver a conta
  // de um cliente por duas letras é frágil demais, mesmo sem empate hoje.
  if (partial.length === 1 && needle.length >= MIN_PARTIAL_LENGTH) {
    const hit = partial[0] as KnownClient;
    return {
      status: 'resolved',
      slug: hit.slug,
      name: hit.name,
      via: 'unique_partial',
      matched: needle,
    };
  }

  return { status: 'unknown', term };
}

function sortSlugs(clients: readonly KnownClient[]): readonly string[] {
  return clients.map((c) => c.slug).sort((a, b) => a.localeCompare(b));
}

/**
 * Frase pronta para o agente responder quando não conseguiu resolver.
 *
 * Fica aqui, e não na camada de mensagem, porque o texto faz parte da decisão:
 * uma recusa que não diz quais são os candidatos obriga o dono a adivinhar de
 * volta, e aí a ambiguidade só trocou de lado.
 */
export function describeResolution(resolution: ClientResolution): string {
  switch (resolution.status) {
    case 'resolved':
      return `${resolution.name} (${resolution.slug})`;
    case 'ambiguous':
      return (
        `"${resolution.term}" pode ser ${resolution.candidates.length} clientes: ` +
        `${resolution.candidates.join(', ')}. Qual deles?`
      );
    case 'unknown':
      return `Não reconheci "${resolution.term}" como cliente.`;
  }
}
