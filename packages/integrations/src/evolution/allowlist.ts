/**
 * Allowlist de números autorizados a interagir com o módulo WhatsApp.
 *
 * Fecha por padrão: número fora da lista nunca chega a um comando, mesmo de
 * consulta. Isso limita o raio de qualquer coisa que dê errado a um conjunto
 * pequeno e conhecido de operadores — não a "qualquer um que descobrir o
 * número da Evolution API".
 */

export interface PhoneAllowlist {
  isAllowed(phone: string): boolean;
  readonly size: number;
}

function normalize(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function createPhoneAllowlist(numbers: readonly string[]): PhoneAllowlist {
  const set = new Set(numbers.map(normalize).filter(Boolean));
  return {
    isAllowed: (phone) => set.has(normalize(phone)),
    size: set.size,
  };
}

/** Allowlist vazia: nega tudo. Padrão seguro quando nada foi configurado. */
export const EMPTY_ALLOWLIST: PhoneAllowlist = createPhoneAllowlist([]);
