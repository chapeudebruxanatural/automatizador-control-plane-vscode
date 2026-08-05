/**
 * Procedência de um dado de inventário.
 *
 * Espelha em código o vocabulário definido em
 * `docs/adr/0003-procedencia-do-inventario.md`. Os arquivos YAML de
 * `inventory/` e `clients/` usam exatamente estes valores.
 */

export const VERIFICATION_STATUSES = [
  /** O dono afirmou. Não foi checado contra sistema nenhum. */
  'owner_reported',
  /** Veio de um sistema, mas a interpretação é inferida. */
  'discovered',
  /** Confirmado contra a fonte autoritativa. */
  'verified',
  /** Duas fontes discordam. Exige resolução humana. */
  'conflicting',
  /** Já foi verificado, mas passou tempo demais para confiar. */
  'stale',
  /** Não se sabe. É uma resposta legítima. */
  'unknown',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export function isVerificationStatus(value: unknown): value is VerificationStatus {
  return (
    typeof value === 'string' && (VERIFICATION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Só `verified` autoriza agir sobre um recurso sem checagem adicional.
 *
 * `discovered` é o caso perigoso: quase sempre certo, e é no "quase" que mora o
 * incidente. O inventário desta operação já produziu um exemplo — o repositório
 * `encantaria_artesanal` foi classificado como commit acidental por inferência
 * de nome e estrutura, e tinha um stack em produção há seis semanas.
 */
export function isActionable(status: VerificationStatus): boolean {
  return status === 'verified';
}

/** Dias após os quais um dado verificado deve ser rebaixado a `stale`. */
export const STALE_AFTER_DAYS = 90;

export function isStale(
  lastVerifiedAt: Date,
  now: Date = new Date(),
  maxAgeDays: number = STALE_AFTER_DAYS,
): boolean {
  const ageMs = now.getTime() - lastVerifiedAt.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}
