import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import type { RawEnv } from '../../shared/src/config.js';

async function loadProtectedSecret(options: {
  readonly env: RawEnv;
  readonly inlineName: string;
  readonly pathName: string;
  readonly defaultPath: string;
}): Promise<string> {
  const inline = options.env[options.inlineName]?.trim();
  if (inline !== undefined && inline !== '') return inline;
  const path = options.env[options.pathName]?.trim() || options.defaultPath;
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`${options.inlineName} não configurado por ambiente nem arquivo protegido`);
  }
  const value = (await readFile(path, 'utf8')).trim();
  if (value === '') throw new Error(`arquivo protegido vazio para ${options.inlineName}`);
  return value;
}

export async function loadProvisioningCredentials(env: RawEnv = process.env): Promise<{
  readonly githubToken: string;
  readonly cloudflareToken: string;
  readonly cloudflareAccountId: string;
}> {
  const githubToken = await loadProtectedSecret({
    env,
    inlineName: 'GITHUB_PROVISION_TOKEN',
    pathName: 'GITHUB_PROVISION_TOKEN_PATH',
    defaultPath: resolve(homedir(), 'Documents/Codex/.secrets/github/provision-token'),
  });
  const cloudflareToken = await loadProtectedSecret({
    env,
    inlineName: 'CLOUDFLARE_PROVISION_TOKEN',
    pathName: 'CLOUDFLARE_PROVISION_TOKEN_PATH',
    defaultPath: resolve(homedir(), 'Documents/Codex/.secrets/cloudflare/provision-token'),
  });
  const cloudflareAccountId = await loadProtectedSecret({
    env,
    inlineName: 'CLOUDFLARE_ACCOUNT_ID',
    pathName: 'CLOUDFLARE_ACCOUNT_ID_PATH',
    defaultPath: resolve(homedir(), 'Documents/Codex/.secrets/cloudflare/account-id'),
  });
  return { githubToken, cloudflareToken, cloudflareAccountId };
}
