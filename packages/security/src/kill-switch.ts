/**
 * Kill switch — freio de emergência global.
 *
 * Ver `docs/adr/0002-kill-switch-por-padrao.md`.
 *
 * Duas propriedades sustentam a garantia:
 *
 * - **Falha fechada.** O estado inicial é acionado. Desligar exige intenção.
 * - **Ponto único.** Vive no domínio, não nos adaptadores. Se cada integração
 *   precisasse implementar o próprio freio, uma delas esqueceria.
 */

export interface KillSwitch {
  isEngaged(): boolean;
  /** Motivo da recusa, para auditoria e para quem lê a resposta. */
  describe(): string;
}

export interface KillSwitchOptions {
  readonly engaged: boolean;
  readonly reason?: string;
}

export function createKillSwitch(options: KillSwitchOptions): KillSwitch {
  const engaged = options.engaged;
  const reason =
    options.reason ??
    'Kill switch acionado: ações com efeito colateral externo estão bloqueadas. ' +
      'Desligar exige CONTROL_PLANE_KILL_SWITCH=false, EXECUTION_MODE=live, ' +
      'aprovação humana e registro em DECISIONS.md.';

  return {
    isEngaged: () => engaged,
    describe: () => (engaged ? reason : 'Kill switch desligado: ações mutantes permitidas.'),
  };
}

/** Kill switch permanentemente acionado. Padrão seguro para testes e mocks. */
export const ALWAYS_ENGAGED: KillSwitch = createKillSwitch({ engaged: true });
