import {makeWorker} from '../worker/index.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const queries=['I want to ski in Tahoe on November 27 and 28.','I want to run at SeaRanch next week','Where in California can I kitesurf in spring?'];
const rows=[];
await Promise.all(queries.map(async query=>{
 const app=makeWorker('');
 const response=await app.fetch(new Request('https://example.test/api/plan',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'synthetic-ci-owner'},body:JSON.stringify({query})}),{OPENAI_API_KEY:process.env.OPENAI_API_KEY});
 const result=await response.json();
 const candidates=(result.candidates||[]).map(({name,sports,sourceUrl,verified})=>({name,sports,sourceUrl,verified}));
 const usedSearch=(result.trace||[]).some(e=>e.type==='tool'&&e.detail==='search_activity_locations');
 const pass=response.ok&&result.status==='results'&&usedSearch&&candidates.length>0&&candidates.length<=3&&candidates.every(c=>c.sourceUrl?.startsWith('https://')&&c.verified===false);
 rows.push({query,httpStatus:response.status,status:result.status,message:result.message||result.error,usedSearch,candidates,trace:result.trace,pass});
}));
await mkdir('evals/results',{recursive:true});await writeFile('evals/results/activity-discovery-live.json',JSON.stringify(rows,null,2));
for(const row of rows)console.log(JSON.stringify(row));
console.log('Passed '+rows.filter(x=>x.pass).length+'/'+rows.length+' live discovery smoke cases. Manual relevance and condition checks still required.');
if(rows.some(x=>!x.pass))process.exitCode=1;
