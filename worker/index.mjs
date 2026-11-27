import {createHarness} from '../dist/harness.mjs';
import {fixtures} from '../dist/fixtures.mjs';
import {createOpenAIModel,defaultModel} from '../models/openai-model.mjs';
import {getWeatherForecast} from '../integrations/weather-api.mjs';
import {getDriveEstimate} from '../integrations/routing-api.mjs';
import {createGeocoder} from '../integrations/geocoding-api.mjs';
import {landscapeBase64,faviconSvg} from '../dist/landscape-assets.mjs';
import {createActivitySearch} from '../integrations/activity-search.mjs';
import {createLangfuseTrace} from '../integrations/langfuse-telemetry.mjs';

// Worker-compatible adapters. The GitHub CLI keeps its stdio MCP client;
// Workers cannot spawn a child process, so this route calls the same NOAA adapter directly.
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const validISO=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const str=(s,max)=>typeof s==='string'?s.trim().slice(0,max):'';
export function makeWorker(html,{modelFactory=createOpenAIModel,weatherTool=getWeatherForecast,routeTool=getDriveEstimate,telemetryFactory=createLangfuseTrace,geocodeTool=createGeocoder(),activitySearchFactory=createActivitySearch}={}){
  return {async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/'&&request.method==='GET')return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if(request.method==='GET'&&url.pathname==='/favicon.svg')return new Response(faviconSvg,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
    if(request.method==='GET'&&url.pathname==='/assets/landscapes.jpg')return new Response(Uint8Array.from(atob(landscapeBase64),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/jpeg','Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
    if(url.pathname!=='/api/plan')return json({error:'Not found'},404);
    if(request.method!=='POST')return json({error:'Use POST'},405);
    // The site is owner-private. Require the platform's authenticated visitor identity too.
    if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Sign in to Adventure Planner first.'},401);
    const origin=request.headers.get('origin');
    if(origin&&origin!==url.origin)return json({error:'Origin not allowed'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Expected JSON'},415);
    if(Number(request.headers.get('content-length'))>8192)return json({error:'Request too long'},413);
    let input;try{const raw=await request.text();if(raw.length>8192)return json({error:'Request too long'},413);input=JSON.parse(raw)}catch{return json({error:'Invalid request'},400)}
    const query=str(input?.query,2000);
    if(!query)return json({error:'Tell me what adventure you have in mind.'},400);
    const p=input?.preferences||{};
    const preferences={dates:str(p.dates,200),skill:str(p.skill,100),origin:str(p.origin,200),startDate:str(p.startDate,10),endDate:str(p.endDate,10),maxTransferMinutes:p.maxTransferMinutes==null?null:Number(p.maxTransferMinutes)};
    if((preferences.startDate||preferences.endDate)&&(!validISO(preferences.startDate)||!validISO(preferences.endDate)||preferences.endDate<preferences.startDate))return json({error:'Choose a valid start and end date.'},400);
    if(preferences.maxTransferMinutes!==null&&(!Number.isFinite(preferences.maxTransferMinutes)||preferences.maxTransferMinutes<1||preferences.maxTransferMinutes>1440))return json({error:'Enter a transfer limit between 1 and 1440 minutes.'},400);
    if(!env.OPENAI_API_KEY)return json({error:'The server API key is not configured.'},503);
    const telemetry=telemetryFactory(env);
    const inputMetadata={queryLength:query.length,hasDates:!!(preferences.startDate&&preferences.endDate),hasSkill:!!preferences.skill,hasOrigin:!!preferences.origin,hasTransferLimit:preferences.maxTransferMinutes!==null};
    let modelError='';
    async function finish(payload,status=200,errorCode){
      // Safe operational diagnostics: never log user messages, names, coordinates or credentials.
      console.info('Adventure Planner outcome '+JSON.stringify({
        traceId:telemetry.traceId,httpStatus:status,
        outcome:['results','clarify','unsupported','insufficient'].includes(payload.status)?payload.status:'error',
        candidates:Array.isArray(payload.candidates)?payload.candidates.length:0,
        geocoded:payload.metrics?.geocodedCandidates??0,
        exploratoryCandidates:payload.exploratoryCandidates?.length??0,
        transferLimitRequested:!!payload.normalizedIntent?.maxTransferMinutes,
        routeOutcomes:(payload.routeEvidence||[]).map(e=>({status:e.data?.status,comparison:e.comparison})),
        searchCalled:!!payload.trace?.some(e=>e.type==='tool'&&e.detail==='search_activity_locations'),
        dateStatus:payload.normalizedIntent?.dateStatus??null,
        forecastEligible:payload.normalizedIntent?.forecastEligible??false,
        traceTypes:(payload.trace||[]).map(e=>e.type).slice(0,24),
        errorCode:errorCode||null
      }));
      telemetry.finish({httpStatus:status,result:payload,inputMetadata,errorCode});
      // Await the bounded export so the tester sees the actual receipt, not just a scheduled task.
      await telemetry.export();
      return json({...payload,traceId:telemetry.traceId,telemetryStatus:telemetry.exportStatus},status);
    }
    try{
      const model=modelFactory({apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL||defaultModel,onError:message=>{modelError=message},onUsage:value=>telemetry.onUsage(value)});
      const result=await createHarness({model:telemetry.wrapModel(model,env.OPENAI_MODEL||defaultModel),fixtures,weatherTool,routeTool,geocodeTool,activitySearchTool:activitySearchFactory({apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL||defaultModel,onUsage:value=>telemetry.onUsage(value)}),maxSteps:7,maxCalls:6,onTrace:event=>telemetry.onTrace(event)}).run({query,preferences});
      if(modelError)return finish({error:'The live model could not complete the request. '+modelError},502,'model_error');
      return finish({...result,model:env.OPENAI_MODEL||defaultModel,weatherTransport:'direct HTTP (NOAA)',limitations:['Web-sourced candidates are exploratory; check primary sources before visiting.','Exact activity locations, opening status, safety and road access are not verified.','Routing is a public demo estimate, not live traffic.']});
    }catch{return finish({error:'The live agent is temporarily unavailable.'},502,'agent_error')}
  }};
}
export default makeWorker(typeof SITE_HTML==='string'?SITE_HTML:'');
