/**
 * Memória operacional isolada por cliente.
 *
 * O arquivo de um cliente nunca contém valor herdado de outro. Esta camada
 * transforma lacunas e associações ainda não verificadas em perguntas curtas,
 * prontas para o dono responder pelo chat ou WhatsApp.
 */

import { z } from 'zod';

import { VERIFICATION_STATUSES } from '../../domain/src/verification.js';

export const ASSOCIATION_KINDS = ['domain', 'repository', 'whatsapp', 'meta_pixel'] as const;
export type AssociationKind = (typeof ASSOCIATION_KINDS)[number];

const verificationSchema = z.enum(VERIFICATION_STATUSES);

export const associationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(ASSOCIATION_KINDS),
  value: z.string().min(1).nullable(),
  verificationStatus: verificationSchema,
  source: z.string().min(1).nullable().optional(),
  note: z.string().min(1).optional(),
});

const measuredValueSchema = z.object({
  value: z.number().nonnegative().nullable(),
  verificationStatus: verificationSchema,
  source: z.string().min(1).nullable().optional(),
});

export const clientMemorySchema = z.object({
  schemaVersion: z.literal(1),
  clientSlug: z.string().min(1),
  updatedAt: z.string().date(),
  associations: z.array(associationSchema),
  economics: z.object({
    maxCostPerConversationBRL: measuredValueSchema,
    funnel: z.object({
      conversations: z.number().int().nonnegative().nullable(),
      contracts: z.number().int().nonnegative().nullable(),
      period: z.string().min(1).nullable(),
      verificationStatus: verificationSchema,
      source: z.string().min(1).nullable().optional(),
    }),
  }),
});

export type ClientMemory = z.infer<typeof clientMemorySchema>;

export interface ConfirmationQuestion {
  readonly id: string;
  readonly clientSlug: string;
  readonly prompt: string;
  readonly answerHint: string;
}

const KIND_LABEL: Readonly<Record<AssociationKind, string>> = {
  domain: 'domínio',
  repository: 'repositório',
  whatsapp: 'WhatsApp oficial',
  meta_pixel: 'pixel/dataset da Meta',
};

/**
 * `owner_reported` já é uma resposta do dono e não precisa ser perguntada de
 * novo. Continua não sendo `verified`: a política global ainda exige fonte
 * autoritativa antes de uma ação automática.
 */
export function buildConfirmationQuestions(memory: ClientMemory): readonly ConfirmationQuestion[] {
  const questions: ConfirmationQuestion[] = [];

  for (const association of memory.associations) {
    if (association.verificationStatus === 'verified' || association.verificationStatus === 'owner_reported') {
      continue;
    }
    const label = KIND_LABEL[association.kind];
    questions.push({
      id: `association:${association.id}`,
      clientSlug: memory.clientSlug,
      prompt:
        association.value === null
          ? `Qual é o ${label} de ${memory.clientSlug}? Se não existir, responda NÃO EXISTE.`
          : `Confirme: o ${label} “${association.value}” pertence a ${memory.clientSlug}?`,
      answerHint: association.value === null ? '<valor> ou NÃO EXISTE' : 'SIM ou NÃO',
    });
  }

  if (memory.economics.maxCostPerConversationBRL.value === null) {
    questions.push({
      id: 'economics:max-cost-per-conversation',
      clientSlug: memory.clientSlug,
      prompt: `Qual é o custo máximo aceitável por conversa para ${memory.clientSlug}, em reais?`,
      answerHint: 'ex.: 25,00',
    });
  }

  const funnel = memory.economics.funnel;
  if (funnel.conversations === null || funnel.contracts === null || funnel.period === null) {
    questions.push({
      id: 'economics:conversation-to-contract',
      clientSlug: memory.clientSlug,
      prompt: `Em qual período, quantas conversas de ${memory.clientSlug} viraram quantos contratos?`,
      answerHint: 'ex.: agosto/2026: 20 conversas, 2 contratos',
    });
  }

  return questions;
}

export function assertMemoryIsolation(expectedSlug: string, memory: ClientMemory): void {
  if (memory.clientSlug !== expectedSlug) {
    throw new Error(
      `memória cruzada: arquivo de ${expectedSlug} declara clientSlug ${memory.clientSlug}`,
    );
  }
}
