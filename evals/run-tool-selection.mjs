/** Deterministic evaluation of accepted tool actions, independent of an LLM judge. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHarness} from '../dist/harness.mjs';
import {fixtures} from '../dist/fixtures.mjs';
import {createOpenAIModel,defaultModel} from '../models/openai-model.mjs';
const dataset=JSON.parse(await readFile(new URL('./tool-selection-v1.json',import.meta.url),'utf8'));
const mk=(criterion,pass,reason)=>({criterion,status:pass?'pass':'fail',reason});
export function gradeSelection(test,calls,attempts=calls){
 const names=calls.map(c=>c.name),attempted=attempts.map(c=>c.name);
 const out=[];
 for(const name of test.required)out.push(mk('required:'+name,names.includes(name),'Accepted tool execution.'));
 for(const name of test.forbidden)out.push(mk('forbidden:'+name,!attempted.includes(name),'No unnecessary tool attempt, including rejected calls.'));
 const finds=attempts.filter(c=>c.name==='find_candidates');
 out.push(mk('fixture_scope',finds.every(c=>test.allowedFixtureScenarios.includes(c.args?.scenario))&&(!test.required.includes('find_candidates')||names.includes('find_candidates')),'Any attempted fixture scenario must be relevant, and required candidate discovery must execute.'));
 out.push(mk('discovery_before_evidence',names.every((n,i)=>!['check_evidence','get_weather_forecast','get_drive_estimate'].includes(n)||(names.indexOf('find_candidates')>=0&&i>names.indexOf('find_candidates'))),'Dependent calls must follow discovery.'));
 out.push(mk('no_rejected_calls',attempts.length===calls.length,'Every attempted tool action must be accepted by the harness.'));
 return out;
}
function instrument(model,onDecision){
 return {...(typeof model.extractIntent==='function'?{extractIntent:ctx=>model.extractIntent(ctx)}:{}),createSession(){const session=typeof model.createSession==='function'?model.createSession():model;return {async next(ctx){const action=await session.next(ctx);onDecision(action);return action}}}};
}
const weatherTool=async args=>({status:'unavailable',source:'controlled eval fixture',...args});
const routeTool=async()=>({status:'unavailable',source:'controlled eval fixture'});
export async function runToolSelection({apiKey=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL||defaultModel,modelFactory=createOpenAIModel,limit=dataset.cases.length}={}){
 if(!apiKey)throw Error('OPENAI_API_KEY missing');
 if(!Number.isSafeInteger(limit)||limit<1||limit>dataset.cases.length)throw Error('Invalid limit');
 const rows=[];
 for(const test of dataset.cases.slice(0,limit)){
  let error=null,latest=null;const calls=[],attempts=[],usage={input:0,output:0};
  const adapter=instrument(modelFactory({apiKey,model,onError:e=>{error=e},onUsage:u=>{usage.input+=Number.isSafeInteger(u.input_tokens)?u.input_tokens:0;usage.output+=Number.isSafeInteger(u.output_tokens)?u.output_tokens:0}}),action=>{latest=action;if(action?.type==='tool')attempts.push({name:action.name,args:action.args})});
  const start=Date.now();
  const result=await createHarness({model:adapter,fixtures,weatherTool,routeTool,maxSteps:7,maxCalls:6,clock:()=>new Date(dataset.referenceTime),onTrace:e=>{if(e.type==='tool'&&latest?.type==='tool'&&latest.name===e.detail)calls.push({name:latest.name,args:latest.args})}}).run(test.input);
  const checks=error||result.trace.some(e=>e.type==='error')?[]:gradeSelection(test,calls,attempts);
  const row={id:test.id,input:test.input,status:result.status,calls,attempts,checks,missingCapabilities:test.missingCapabilities,error:error||(!checks.length?'No gradeable execution':null),message:result.message,normalizedIntent:result.normalizedIntent,usage,durationMs:Date.now()-start};
  rows.push(row);console.log(JSON.stringify({id:row.id,status:row.status,calls:row.calls,attempts:row.attempts,checks:row.checks,missingCapabilities:row.missingCapabilities,error:row.error}));
  if(/HTTP 401|HTTP 429.*insufficient_quota/.test(error||''))break;
 }
 const checks=rows.flatMap(r=>r.checks),pass=checks.filter(c=>c.status==='pass').length,fail=checks.filter(c=>c.status==='fail').length;
 const summary={executed:rows.length,requested:limit,pass,fail,passRate:pass+fail?pass/(pass+fail):null,errors:rows.filter(r=>r.error).length,scenariosWithMissingCapabilities:rows.filter(r=>r.missingCapabilities.length).length,uniqueMissingCapabilities:[...new Set(rows.flatMap(r=>r.missingCapabilities))]};
 return {dataset:dataset.dataset,referenceTime:dataset.referenceTime,sourceCommit:process.env.GITHUB_SHA||null,model,summary,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await runToolSelection({limit:Number(process.env.EVAL_LIMIT||dataset.cases.length)});const dir=fileURLToPath(new URL('./results/',import.meta.url));await mkdir(dir,{recursive:true});await writeFile(dir+'tool-selection-baseline.json',JSON.stringify(result,null,2)+'\n');
 const s=result.summary;
 const report=['# Tool Selection — baseline','',`Executed: ${s.executed}/${s.requested}; errors: ${s.errors}.`,`Deterministic checks: ${s.pass} pass, ${s.fail} fail; pass rate ${s.passRate===null?'N/A':(100*s.passRate).toFixed(1)+'%'}.`,`Scenarios with missing capabilities: ${s.scenariosWithMissingCapabilities}/${s.executed}.`,'','| Case | Accepted tools | Checks passed | Missing capabilities |','|---|---|---:|---|',...result.rows.map(r=>`| ${r.id} | ${r.calls.map(c=>c.name).join(', ')||'None'} | ${r.checks.filter(c=>c.status==='pass').length}/${r.checks.length} | ${r.missingCapabilities.join(', ')||'None'} |`),'','Missing capabilities are not counted as model selection failures. No actual live weather, trail, route, or season accuracy is validated.'].join('\n');
 console.log(report);if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,report+'\n');
}
