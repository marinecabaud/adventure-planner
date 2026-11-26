import {createHarness,demoModel} from '../dist/harness.mjs';
import {fixtures} from '../dist/fixtures.mjs';
import {connectWeatherMcp} from './weather-mcp-client.mjs';
const mcp=await connectWeatherMcp();
try{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const startDate=process.argv[2]||today,endDate=process.argv[3]||startDate;
  const model={async next(ctx){
    const candidates=ctx.events.find(e=>e.kind==='observation'&&e.name==='find_candidates')?.data;
    const checks=ctx.events.find(e=>e.kind==='observation'&&e.name==='check_evidence');
    if(candidates&&checks){
      const visited=new Set(ctx.events.filter(e=>e.kind==='observation'&&e.name==='get_weather_forecast').map(e=>e.data.candidate_id));
      const next=candidates.find(c=>!visited.has(c.id));if(next)return {type:'tool',name:'get_weather_forecast',args:{candidate_id:next.id}};
    }
    return demoModel.next(ctx);
  }};
  const result=await createHarness({model,fixtures,weatherTool:mcp.weather,maxSteps:7,maxCalls:5}).run({query:'Ski and trail run in Tahoe',preferences:{startDate,endDate}});
  console.log(JSON.stringify({discoveredTools:mcp.tools.map(x=>x.name),status:result.status,trace:result.trace,weatherEvidence:result.weatherEvidence,candidateMode:result.evidenceMode},null,2));
}finally{await mcp.close();}
