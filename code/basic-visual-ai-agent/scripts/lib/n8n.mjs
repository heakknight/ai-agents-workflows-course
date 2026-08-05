import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const workflowPaths = [
  path.join(projectRoot, 'workflows', 'summarize-text-tool.json'),
  path.join(projectRoot, 'workflows', 'create-pdf-tool.json'),
  path.join(projectRoot, 'workflows', 'summary-pdf-agent.json'),
];

export function loadLocalEnv() {
  const envPath = path.join(projectRoot, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

export function getRuntime() {
  loadLocalEnv();

  const configuredUserFolder = process.env.N8N_USER_FOLDER || '.data';
  const userFolder = path.isAbsolute(configuredUserFolder)
    ? configuredUserFolder
    : path.resolve(projectRoot, configuredUserFolder);
  const pdfOutputFolder = path.join(projectRoot, 'generated-pdfs');
  const n8nStateFolder = path.join(userFolder, '.n8n');
  const markerPath = path.join(n8nStateFolder, 'summary-pdf-agent.seed.json');
  const n8nEntrypoint = path.join(projectRoot, 'node_modules', 'n8n', 'bin', 'n8n');

  mkdirSync(pdfOutputFolder, { recursive: true });

  return {
    executable: process.execPath,
    n8nEntrypoint,
    markerPath,
    n8nStateFolder,
    pdfOutputFolder,
    userFolder,
    env: {
      ...process.env,
      N8N_USER_FOLDER: userFolder,
      N8N_RESTRICT_FILE_ACCESS_TO: pdfOutputFolder,
      N8N_LISTEN_ADDRESS: process.env.N8N_LISTEN_ADDRESS ?? '127.0.0.1',
      N8N_DIAGNOSTICS_ENABLED: process.env.N8N_DIAGNOSTICS_ENABLED ?? 'false',
      N8N_VERSION_NOTIFICATIONS_ENABLED:
        process.env.N8N_VERSION_NOTIFICATIONS_ENABLED ?? 'false',
      N8N_PERSONALIZATION_ENABLED: process.env.N8N_PERSONALIZATION_ENABLED ?? 'false',
      N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS:
        process.env.N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS ?? 'true',
    },
  };
}

export function readWorkflows() {
  return workflowPaths.map((workflowPath) => JSON.parse(readFileSync(workflowPath, 'utf8')));
}

export function workflowFingerprint() {
  const hash = createHash('sha256');
  for (const workflowPath of workflowPaths) hash.update(readFileSync(workflowPath));
  return hash.digest('hex');
}

export function isSeeded(markerPath) {
  if (!existsSync(markerPath)) return false;

  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    const workflowIds = readWorkflows().map((workflow) => workflow.id);
    return JSON.stringify(marker.workflowIds) === JSON.stringify(workflowIds);
  } catch {
    return false;
  }
}

export function writeSeedMarker(markerPath) {
  mkdirSync(path.dirname(markerPath), { recursive: true });
  const workflows = readWorkflows();
  writeFileSync(
    markerPath,
    `${JSON.stringify(
      {
        workflowIds: workflows.map((workflow) => workflow.id),
        sourceFingerprint: workflowFingerprint(),
        seededAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

export function runN8n(args, runtime = getRuntime()) {
  if (!existsSync(runtime.n8nEntrypoint)) {
    throw new Error(
      `n8n is not installed at ${runtime.n8nEntrypoint}. Run "nvm use" and "npm install" first.`,
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(runtime.executable, [runtime.n8nEntrypoint, ...args], {
      cwd: projectRoot,
      env: runtime.env,
      shell: false,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) resolve({ code: 1, signal });
      else resolve({ code: code ?? 1, signal: null });
    });
  });
}

export async function seedWorkflow({ force = false } = {}) {
  const runtime = getRuntime();

  for (const workflowPath of workflowPaths) {
    if (!existsSync(workflowPath)) throw new Error(`Bundled workflow not found at ${workflowPath}.`);
  }

  if (!force && isSeeded(runtime.markerPath)) {
    console.log('Bundled workflows are already seeded; preserving local student edits.');
    return { seeded: false, runtime };
  }

  console.log(force ? 'Re-seeding bundled workflows…' : 'Seeding bundled workflows…');
  for (const workflowPath of workflowPaths) {
    const result = await runN8n(['import:workflow', `--input=${workflowPath}`], runtime);
    if (result.code !== 0) {
      throw new Error(`n8n workflow import failed for ${workflowPath} with exit code ${result.code}.`);
    }
  }

  // n8n 2.x only lets other workflows call published sub-workflows. The two
  // helpers have no public trigger, so publishing them exposes no endpoint.
  for (const workflow of readWorkflows().slice(0, 2)) {
    const result = await runN8n(['publish:workflow', `--id=${workflow.id}`], runtime);
    if (result.code !== 0) {
      throw new Error(`n8n workflow publish failed for ${workflow.name} with exit code ${result.code}.`);
    }
  }

  writeSeedMarker(runtime.markerPath);
  console.log(`Seeded workflows: ${readWorkflows().map((workflow) => workflow.name).join(', ')}`);
  return { seeded: true, runtime };
}
