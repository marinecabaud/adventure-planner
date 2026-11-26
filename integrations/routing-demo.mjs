import {createHarness,demoModel} from '../dist/harness.mjs';
import {fixtures} from '../dist/fixtures.mjs';
import {getDriveEstimate} from './routing-api.mjs';
const limit=Number(process.argv[2]||60);
if(!Number.isFinite(limit)||limit<=0)throw Error('Provide a positive transfer limit in minutes.');
const model={async next(ctx){
  const checks=ctx.events.find(e=>e.kind==='observation'&&e.name==='check_evidence');
  const route=ctx.events.find(e=>e.kind==='observation'&&e.name==='get_drive_estimate');
  if(checks&&!route)return {type:'tool',name:'get_drive_estimate',args:{from_candidate_id:'tahoe-0',to_candidate_id:'tahoe-2'}};
  if(route)return {type:'final',status:'insufficient',message:'Zone-to-zone transfer estimate only. Exact sports locations, road access and activity availability remain unverified.'};
  return demoModel.next(ctx);
}};
const result=await createHarness({model,fixtures,routeTool:getDriveEstimate}).run({query:'Ski and trail run in Tahoe',preferences:{maxTransferMinutes:limit}});
console.log(JSON.stringify({status:result.status,message:result.message,trace:result.trace,routeEvidence:result.routeEvidence,candidateMode:result.evidenceMode},null,2));
