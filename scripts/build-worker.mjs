// Zero-dependency deterministic build: the existing source modules are dependency-free.
// Remove only the explicit imports in the Worker entry; retain each module verbatim.
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
const files=['dist/harness.mjs','dist/fixtures.mjs','models/openai-model.mjs','integrations/weather-api.mjs','integrations/routing-api.mjs','integrations/langfuse-telemetry.mjs'];
const modules=await Promise.all(files.map(f=>readFile(f,'utf8')));
const worker=(await readFile('worker/index.mjs','utf8')).replace(/^import .*;\s*$/gm,'');
const html=await readFile('dist/index.html','utf8');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',modules.join('\n')+'\nconst SITE_HTML='+JSON.stringify(html)+';\n'+worker);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
