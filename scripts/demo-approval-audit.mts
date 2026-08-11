import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createFileApprovalProvider } from '../packages/security/src/approval.js';
import { createRotatingFileAuditProvider } from '../packages/audit/src/audit.js';

async function ensureDir(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function seedApprovals(filePath) {
  await ensureDir(filePath);
  const record = {
    id: 'demo-1',
    kind: 'demo:mutate',
    approvedBy: 'demo-runner',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  await writeFile(filePath, JSON.stringify(record) + '\n', 'utf8');
}

async function run() {
  const approvalsPath = './audit/demo-approvals.jsonl';
  const auditPath = './audit/demo-audit.jsonl';

  console.log('Preparando arquivos de demonstração...');
  await seedApprovals(approvalsPath);

  const approval = createFileApprovalProvider(approvalsPath);
  const audit = createRotatingFileAuditProvider(auditPath, 400, 2);

  console.log('Tentativa 1: executar ação mutante (esperado: aprovado)');
  const request = { kind: 'demo:mutate' };
  const decision1 = await approval.decide(request as any, true);
  console.log('Decisão 1:', decision1);
  await audit.record({
    kind: request.kind,
    target: 'demo-target',
    mutating: true,
    outcome: decision1.approved ? 'executed' : 'refused',
    detail: decision1.reason,
    requestedBy: decision1.approvedBy,
  });

  console.log('Tentativa 2: executar ação mutante (esperado: recusado, uso único)');
  const decision2 = await approval.decide(request as any, true);
  console.log('Decisão 2:', decision2);
  await audit.record({
    kind: request.kind,
    target: 'demo-target',
    mutating: true,
    outcome: decision2.approved ? 'executed' : 'refused',
    detail: decision2.reason,
    requestedBy: decision2.approvedBy,
  });

  console.log('Gerando muitos eventos para acionar rotação de arquivo...');
  for (let i = 0; i < 30; i++) {
    await audit.record({
      kind: `demo:heartbeat:${i}`,
      target: 'demo-target',
      mutating: false,
      outcome: 'executed',
      detail: `heartbeat ${i}`,
    });
  }

  console.log('Demonstração concluída. Revise o diretório audit/ para ver os arquivos.');
}

run().catch((err) => {
  console.error('Erro na demo:', err);
  process.exitCode = 1;
});
