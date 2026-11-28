// Scripted user turns with real Pi resource loading, extension events and provider transport.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const [sdk, extension, ...prompts] = process.argv.slice(2);
const host = await import(pathToFileURL(sdk));
assert.equal(host.VERSION, '1.7.0');
const cwd = process.cwd(), agentDir = process.env.PI_CODING_AGENT_DIR;
const modelRuntime = await host.ModelRuntime.create({ modelsPath: `${agentDir}/models.json`, refreshOnCreate: false, allowModelNetwork: false });
const model = modelRuntime.getModel('local', 'gpt-4o');
assert.ok(model);
const resourceLoader = new host.DefaultResourceLoader({cwd, agentDir, additionalExtensionPaths: extension ? [extension] : [],
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true});
await resourceLoader.reload();
assert.deepEqual(resourceLoader.getExtensions().errors, []);
const {session} = await host.createAgentSession({cwd, agentDir, model, modelRuntime, thinkingLevel:'off', resourceLoader,
  sessionManager: host.SessionManager.inMemory(cwd)});
try {
  await session.bindExtensions({mode:'print'});
  session.subscribe(event => {
    if (['tool_execution_end','auto_retry_start'].includes(event.type)) console.log(JSON.stringify(event));
  });
  for (const prompt of prompts) {
    const settled = new Promise(resolve => { const off = session.subscribe(event => {
      if (event.type === "agent_settled") { off(); resolve(); }
    }); });
    await session.prompt(prompt);
    await settled;
    const last = session.messages.at(-1);
    assert.notEqual(last?.stopReason, 'error', last?.errorMessage);
  }
} finally { session.dispose(); }
