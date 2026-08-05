#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, readWorkflows, workflowPaths } from './lib/n8n.mjs';

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const relativePath of [
  '.nvmrc',
  '.env.example',
  'README.md',
  'scripts/n8n-cli.mjs',
  'workflows/summary-pdf-agent.json',
  'workflows/summarize-text-tool.json',
  'workflows/create-pdf-tool.json',
  'samples/agent-demo.txt',
]) {
  assert(existsSync(path.join(projectRoot, relativePath)), `Missing ${relativePath}`);
}

const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
assert(packageJson.name === 'basic-visual-ai-agent', 'package.json has the wrong project name');
assert(packageJson.private === true, 'package.json must remain private');
assert(packageJson.dependencies?.n8n === '2.32.5', 'n8n must be pinned to 2.32.5');
assert(packageJson.engines?.node === '>=22.22 <25', 'Node engine range is not pinned as expected');
assert(
  packageJson.scripts?.n8n === 'node scripts/n8n-cli.mjs',
  'Arbitrary n8n CLI commands must use the isolated-state wrapper',
);

const runtimeSource = readFileSync(path.join(projectRoot, 'scripts/lib/n8n.mjs'), 'utf8');
assert(
  runtimeSource.includes("N8N_LISTEN_ADDRESS: process.env.N8N_LISTEN_ADDRESS ?? '127.0.0.1'"),
  'Runtime must bind to loopback by default',
);
assert(runtimeSource.includes("path.join(projectRoot, 'generated-pdfs')"), 'Runtime must create the fixed PDF output directory');
assert(runtimeSource.includes('N8N_RESTRICT_FILE_ACCESS_TO: pdfOutputFolder'), 'Filesystem access must be restricted to generated-pdfs');
assert(runtimeSource.includes("runN8n(['publish:workflow'"), 'Runtime must publish callable helper workflows');
assert(runtimeSource.includes('shell: false'), 'n8n process launch must not use a shell');
assert(workflowPaths.length === 3, 'Runtime must seed exactly three workflows');

const envExample = readFileSync(path.join(projectRoot, '.env.example'), 'utf8');
assert(!envExample.includes('API_KEY='), '.env.example must not invite storing AI credentials');
const gitignore = readFileSync(path.join(projectRoot, '.gitignore'), 'utf8');
assert(gitignore.includes('generated-pdfs/*'), 'Generated PDFs must be ignored');

const workflows = readWorkflows();
const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
assert(workflowById.size === 3, 'Workflow IDs must be unique');

for (const workflow of workflows) {
  assert(typeof workflow.id === 'string' && workflow.id.length > 0, `${workflow.name} needs a stable ID`);
  assert(workflow.active === false, `${workflow.name} must be an unpublished draft`);
  assert(Array.isArray(workflow.nodes) && workflow.nodes.length >= 3, `${workflow.name} has too few nodes`);
  assert(workflow.connections && typeof workflow.connections === 'object', `${workflow.name} needs connections`);

  const nodeNames = new Set();
  const nodeIds = new Set();
  for (const node of workflow.nodes || []) {
    assert(!nodeNames.has(node.name), `${workflow.name} has duplicate node name: ${node.name}`);
    assert(!nodeIds.has(node.id), `${workflow.name} has duplicate node ID: ${node.id}`);
    nodeNames.add(node.name);
    nodeIds.add(node.id);
    assert(!node.credentials, `Bundled node must not reference credentials: ${workflow.name}/${node.name}`);
  }

  for (const [source, connectionGroups] of Object.entries(workflow.connections || {})) {
    assert(nodeNames.has(source), `${workflow.name} connection source does not exist: ${source}`);
    for (const outputs of Object.values(connectionGroups)) {
      for (const output of outputs || []) {
        for (const connection of output || []) {
          assert(nodeNames.has(connection.node), `${workflow.name} connection target does not exist: ${connection.node}`);
        }
      }
    }
  }
}

const agentWorkflow = workflowById.get('summary-pdf-agent-2325');
const summaryWorkflow = workflowById.get('summarize-text-tool-2325');
const pdfWorkflow = workflowById.get('create-pdf-tool-2325');
assert(agentWorkflow?.name === 'Summary & PDF Agent', 'Missing main agent workflow');
assert(summaryWorkflow?.name === 'Tool - Summarize Text', 'Missing summarization tool workflow');
assert(pdfWorkflow?.name === 'Tool - Create PDF', 'Missing PDF tool workflow');

const findType = (workflow, type) => workflow?.nodes.find((node) => node.type === type);
const findName = (workflow, name) => workflow?.nodes.find((node) => node.name === name);

const trigger = findType(agentWorkflow, '@n8n/n8n-nodes-langchain.chatTrigger');
const agent = findType(agentWorkflow, '@n8n/n8n-nodes-langchain.agent');
const agentModel = findName(agentWorkflow, 'Agent Chat Model');
const setupNote = findName(agentWorkflow, 'Credentials and output');
const toolNodes = agentWorkflow?.nodes.filter(
  (node) => node.type === '@n8n/n8n-nodes-langchain.toolWorkflow',
) || [];
assert(trigger?.typeVersion === 1.4, 'Main workflow must use Chat Trigger v1.4');
assert(trigger?.parameters?.public === false, 'Chat Trigger must remain private');
assert(trigger?.parameters?.options?.responseMode === 'lastNode', 'Chat Trigger must return the agent output');
assert(agent?.typeVersion === 3.1, 'Main workflow must use AI Agent v3.1');
assert(
  agent?.parameters?.options?.systemMessage === "You are an agent that's there to help people summarize text.",
  'AI Agent must use the required concise system prompt',
);
assert(agent?.parameters?.options?.enableStreaming === false, 'Non-streaming chat must match last-node response mode');
assert(agentModel?.type === '@n8n/n8n-nodes-langchain.lmChatOpenAi', 'Agent needs an OpenAI Chat Model');
assert(agentModel?.parameters?.model?.value === 'gpt-5.6-sol', 'Agent model must use GPT-5.6 Sol');
assert(agentModel?.parameters?.model?.mode === 'id', 'Preview model must use an explicit model ID');
assert(agentModel?.parameters?.responsesApiEnabled === true, 'Agent model must use the Responses API');
assert(agentModel?.parameters?.options?.reasoningEffort === 'high', 'Agent model must use high reasoning effort');
assert(
  setupNote?.parameters?.content?.includes('publish **Tool - Summarize Text**'),
  'Setup note must explain that the credential-bearing summary helper needs publishing',
);
assert(toolNodes.length === 2, 'AI Agent must have exactly two workflow tools');
assert(toolNodes.some((node) => node.name === 'summarize_text'), 'Missing summarize_text tool');
assert(toolNodes.some((node) => node.name === 'create_pdf'), 'Missing create_pdf tool');

for (const toolNode of toolNodes) {
  const targetId = toolNode.parameters?.workflowId?.value;
  assert(workflowById.has(targetId), `${toolNode.name} references an unknown helper workflow`);
  assert(toolNode.typeVersion === 2.2, `${toolNode.name} must use workflow tool v2.2`);
  const values = Object.values(toolNode.parameters?.workflowInputs?.value || {});
  assert(values.length > 0 && values.every((value) => value.includes('$fromAI(')), `${toolNode.name} inputs must be supplied by the agent`);
}

const mainConnections = agentWorkflow?.connections || {};
assert(
  mainConnections['When chat message received']?.main?.[0]?.some((connection) => connection.node === 'Summary & PDF Agent'),
  'Chat Trigger must connect to the AI Agent',
);
for (const toolName of ['summarize_text', 'create_pdf']) {
  assert(
    mainConnections[toolName]?.ai_tool?.[0]?.some((connection) => connection.node === 'Summary & PDF Agent'),
    `${toolName} must connect to the AI Agent as ai_tool`,
  );
}

const summaryTrigger = findType(summaryWorkflow, 'n8n-nodes-base.executeWorkflowTrigger');
const summaryChain = findType(summaryWorkflow, '@n8n/n8n-nodes-langchain.chainLlm');
const summaryModel = findName(summaryWorkflow, 'Summary Chat Model');
assert(summaryTrigger?.parameters?.workflowInputs?.values?.some((field) => field.name === 'text'), 'Summary helper must accept text');
assert(summaryChain?.typeVersion === 1.9, 'Summary helper must use Basic LLM Chain v1.9');
assert(summaryChain?.parameters?.promptType === 'define', 'Summary chain must define its guarded prompt');
assert(summaryChain?.parameters?.text?.includes('<source>'), 'Summary prompt must delimit untrusted source text');
assert(summaryChain?.parameters?.messages?.messageValues?.[0]?.message?.includes('untrusted data'), 'Summary chain needs prompt-injection guidance');
assert(summaryModel?.type === '@n8n/n8n-nodes-langchain.lmChatOpenAi', 'Summary helper needs its own AI model node');
assert(summaryModel?.parameters?.model?.value === 'gpt-5.6-sol', 'Summary model must use GPT-5.6 Sol');
assert(summaryModel?.parameters?.model?.mode === 'id', 'Summary preview model must use an explicit model ID');
assert(summaryModel?.parameters?.responsesApiEnabled === true, 'Summary model must use the Responses API');
assert(summaryModel?.parameters?.options?.reasoningEffort === 'high', 'Summary model must use high reasoning effort');
assert(
  summaryWorkflow?.connections?.['Summary Chat Model']?.ai_languageModel?.[0]?.some((connection) => connection.node === 'Summarize with AI'),
  'Summary Chat Model must connect to the Basic LLM Chain',
);

const pdfTrigger = findType(pdfWorkflow, 'n8n-nodes-base.executeWorkflowTrigger');
const pdfBuilder = findName(pdfWorkflow, 'Build PDF');
const pdfWriter = findName(pdfWorkflow, 'Write PDF to Disk');
const codeNodes = workflows.flatMap((workflow) =>
  workflow.nodes
    .filter((node) => node.type === 'n8n-nodes-base.code')
    .map((node) => ({ workflow, node })),
);
const pdfInputs = pdfTrigger?.parameters?.workflowInputs?.values || [];
assert(pdfInputs.some((field) => field.name === 'title'), 'PDF helper must accept a title');
assert(pdfInputs.some((field) => field.name === 'content'), 'PDF helper must accept content');
assert(pdfBuilder?.type === 'n8n-nodes-base.code', 'PDF helper needs a deterministic Code node');
assert(pdfBuilder?.parameters?.jsCode?.includes('12000'), 'PDF helper must enforce its content limit');
assert(pdfWriter?.type === 'n8n-nodes-base.readWriteFile', 'PDF helper must write a real file');
assert(pdfWriter?.parameters?.operation === 'write', 'PDF disk node must use write operation');
assert(pdfWriter?.parameters?.fileName?.includes("'generated-pdfs/'"), 'PDFs must stay in the fixed generated-pdfs directory');
assert(
  pdfWorkflow?.connections?.['Build PDF']?.main?.[0]?.some(
    (connection) => connection.node === 'Write PDF to Disk',
  ),
  'PDF builder must connect directly to the disk writer',
);
assert(
  !Object.hasOwn(pdfWorkflow?.connections || {}, 'Write PDF to Disk'),
  'Write PDF to Disk must be the terminal PDF node',
);
assert(codeNodes.length === 1, 'Exactly one Code node must remain across all workflows');
assert(
  codeNodes[0]?.workflow === pdfWorkflow && codeNodes[0]?.node === pdfBuilder,
  'Build PDF must be the only remaining Code node',
);

if (pdfBuilder?.parameters?.jsCode) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runPdfBuilder = new AsyncFunction('$input', pdfBuilder.parameters.jsCode);
  const captured = {};
  const context = {
    helpers: {
      async prepareBinaryData(buffer, fileName, mimeType) {
        captured.buffer = buffer;
        captured.fileName = fileName;
        captured.mimeType = mimeType;
        return { data: buffer.toString('base64'), fileName, mimeType };
      },
    },
  };

  try {
    const result = await runPdfBuilder.call(context, {
      item: { json: { title: 'Teaching Summary', content: 'Overview\n- First point\n- Second point' } },
    });
    assert(Buffer.isBuffer(captured.buffer), 'PDF builder must prepare a binary buffer');
    assert(captured.buffer?.subarray(0, 8).toString('latin1') === '%PDF-1.4', 'Generated file must have a PDF header');
    assert(captured.buffer?.toString('latin1').includes('%%EOF'), 'Generated PDF must have an EOF marker');
    assert(captured.fileName?.endsWith('.pdf'), 'Generated file must have a .pdf extension');
    assert(captured.mimeType === 'application/pdf', 'Generated file must use the PDF MIME type');
    assert(result?.json?.pageCount === 1, 'Short content should produce one PDF page');
    assert(result?.binary?.data?.data, 'PDF builder must return n8n binary data');
  } catch (error) {
    failures.push(`PDF generation test failed: ${error.message}`);
  }

  try {
    await runPdfBuilder.call(context, { item: { json: { title: 'Empty', content: '' } } });
    failures.push('Empty PDF content must be rejected');
  } catch (error) {
    assert(error.message.includes('required'), 'Empty PDF error should explain that content is required');
  }
}

const serializedWorkflows = JSON.stringify(workflows).toLowerCase();
for (const secretMarker of ['sk-proj-', 'api_key=', 'authorization: bearer']) {
  assert(!serializedWorkflows.includes(secretMarker), `Possible embedded secret: ${secretMarker}`);
}

if (failures.length > 0) {
  console.error('Project validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const nodeCount = workflows.reduce((total, workflow) => total + workflow.nodes.length, 0);
  console.log(`Validated ${workflows.length} workflows, ${nodeCount} nodes, PDF generation, runtime pins, and secret hygiene.`);
}
