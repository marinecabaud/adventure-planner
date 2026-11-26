/** Model-independent execution harness; candidate search uses illustrative fixtures; optional evidence tools use adapters. */
export const instructions = `You are Adventure Planner, a California-only multi-sport travel assistant.
Respect mandatory constraints and skill level per sport. Distinguish seasonal patterns from live conditions.
Use tool evidence; never invent availability, travel times or sources. Return up to three supported options.
If evidence is missing, clarify or explain limitations. Fixture data is not live evidence.`;
export const toolDefinitions = [
  {name:'find_candidates', description:'Return illustrative California candidate areas for a supported demo request.', parameters:{type:'object',properties:{scenario:{type:'string',enum:['tahoe','kite','santa']}},required:['scenario'],additionalProperties:false}},
  {name:'check_evidence', description:'Identify evidence that must be checked for candidate areas. Fixture data only.',parameters:{type:'object',properties:{candidate_ids:{type:'array',items:{type:'string'},maxItems:3}},required:['candidate_ids'],additionalProperties:false}}
];
const outcomes=new Set(['results','clarify','unsupported','insufficient']);
const sports=['ski / snowboard','kitesurf','hiking','mountain biking','surf','trail running','cycling'];
const clean=s=>typeof s==='string'?s.trim():'';
export function createHarness({model,fixtures,maxSteps=6,maxCalls=4,weatherTool=null,routeTool=null}){
  if(typeof model?.next!=='function'&&typeof model?.createSession!=='function')throw new Error('Model adapter must implement next(context) or createSession()');
  return {async run(request){
    const trace=[];const events=[];let calls=0;let available=new Map();let checked=new Set();let weatherEvidence=[];let routeEvidence=[];
    const emit=(type,detail)=>trace.push({step:trace.length+1,type,detail});
    function finish(status,message,candidates=[]){
      emit('finish',status);
      return {status,message,candidates,weatherEvidence,routeEvidence,trace,metrics:{toolCalls:calls,modelSteps:events.filter(x=>x.kind==='decision').length},evidenceMode:'fixture'};
    }
    if(!clean(request?.query))return finish('clarify','Tell me which sports, dates or destination you have in mind.');
    const state={query:clean(request.query),preferences:{dates:clean(request.preferences?.dates),skill:clean(request.preferences?.skill),origin:clean(request.preferences?.origin),startDate:clean(request.preferences?.startDate),endDate:clean(request.preferences?.endDate),maxTransferMinutes:Number.isFinite(request.preferences?.maxTransferMinutes)&&request.preferences.maxTransferMinutes>0?request.preferences.maxTransferMinutes:null}};
    emit('request','User intent received');
    const session=typeof model.createSession==='function'?model.createSession():model;
    const registeredTools=[...toolDefinitions];
    if(weatherTool)registeredTools.push({name:'get_weather_forecast',description:'Get short-term NWS weather for an existing candidate and explicit travel dates; does not verify activity availability.',parameters:{type:'object',properties:{candidate_id:{type:'string'}},required:['candidate_id'],additionalProperties:false}});
    if(routeTool)registeredTools.push({name:'get_drive_estimate',description:'Estimate road travel between two known representative candidate areas; no live traffic or access verification.',parameters:{type:'object',properties:{from_candidate_id:{type:'string'},to_candidate_id:{type:'string'}},required:['from_candidate_id','to_candidate_id'],additionalProperties:false}});
    for(let i=0;i<maxSteps;i++){
      let action;
      try{action=await session.next({instructions,toolDefinitions:registeredTools,state:structuredClone(state),events:structuredClone(events)});}
      catch(e){emit('error','Model adapter failed');return finish('insufficient','The agent could not complete this request.');}
      events.push({kind:'decision',action});
      if(!action||typeof action!=='object'){emit('reject','Invalid action');return finish('insufficient','The agent returned an invalid action.');}
      if(action.type==='tool'){
        if(calls>=maxCalls){emit('limit','Tool budget reached');return finish('insufficient','The research limit was reached before enough evidence was available.');}
        const args=action.args;
        if(!args||typeof args!=='object'||Array.isArray(args)){emit('reject','Invalid tool arguments');return finish('insufficient','The research request was invalid.');}
        if(action.name==='find_candidates'&&Object.keys(args).length===1&&Object.hasOwn(fixtures,args.scenario)){
          if(!['tahoe','kite','santa'].includes(args.scenario)){emit('reject','Unknown scenario');return finish('insufficient','Unknown demo scenario.');}
          const rows=fixtures[args.scenario].slice(0,3).filter(x=>x.lat>=32.5&&x.lat<=42&&x.lon>=-124.6&&x.lon<=-114);
          const records=rows.map((x,id)=>({id:args.scenario+'-'+id,...x,geography:'California',evidence:'fixture'}));
          records.forEach(x=>available.set(x.id,x));
          calls++;emit('tool',action.name);events.push({kind:'observation',name:action.name,data:records});
        }else if(action.name==='check_evidence'&&Object.keys(args).length===1&&Array.isArray(args.candidate_ids)&&args.candidate_ids.length<=3&&args.candidate_ids.every(id=>available.has(id))){
          const rows=args.candidate_ids.map(id=>({id,requiredChecks:available.get(id).check,verified:false,sourceType:'illustrative fixture'}));rows.forEach(x=>checked.add(x.id));
          calls++;emit('tool',action.name);events.push({kind:'observation',name:action.name,data:rows});
        }else if(weatherTool&&action.name==='get_weather_forecast'&&Object.keys(args).length===1&&available.has(args.candidate_id)&&state.preferences.startDate&&state.preferences.endDate){
          const candidate=available.get(args.candidate_id);
          calls++;emit('tool',action.name);
          let data;
          try{data=await weatherTool({latitude:candidate.lat,longitude:candidate.lon,startDate:state.preferences.startDate,endDate:state.preferences.endDate});}
          catch{data={status:'unavailable',reason:'Weather MCP call failed.'};}
          if(!data||typeof data.status!=='string')data={status:'unavailable',reason:'Invalid weather tool response.'};
          weatherEvidence.push({candidate_id:candidate.id,data});events.push({kind:'observation',name:action.name,data:{candidate_id:candidate.id,...data}});
        }else if(routeTool&&action.name==='get_drive_estimate'&&Object.keys(args).length===2&&available.has(args.from_candidate_id)&&available.has(args.to_candidate_id)&&args.from_candidate_id!==args.to_candidate_id){
          const from=available.get(args.from_candidate_id),to=available.get(args.to_candidate_id);
          calls++;emit('tool',action.name);
          let data;
          try{data=await routeTool({from:{latitude:from.lat,longitude:from.lon},to:{latitude:to.lat,longitude:to.lon}});}
          catch{data={status:'unavailable',reason:'Routing API call failed.'};}
          if(!data||!['estimate_available','no_route','unavailable','invalid_request'].includes(data.status)||(data.status==='estimate_available'&&(!Number.isFinite(data.durationSeconds)||data.durationSeconds<0||!Number.isFinite(data.distanceMeters)||data.distanceMeters<0)))data={status:'unavailable',reason:'Invalid routing response.'};
          const limit=state.preferences.maxTransferMinutes;
          const comparison=data.status==='estimate_available'&&limit!==null?(data.durationSeconds<=limit*60?'within_limit':'exceeds_limit'):'unknown';
          const evidence={from_candidate_id:from.id,to_candidate_id:to.id,maxTransferMinutes:limit,comparison,data};
          routeEvidence.push(evidence);events.push({kind:'observation',name:action.name,data:evidence});
        }else{emit('reject','Unregistered tool or invalid arguments');return finish('insufficient','The agent requested an unsupported research action.');}
      }else if(action.type==='final'){
        if(!outcomes.has(action.status)||!clean(action.message)){emit('reject','Invalid final response');return finish('insufficient','The agent could not produce a valid response.');}
        if(action.status!=='results')return finish(action.status,clean(action.message));
        const ids=action.candidate_ids;
        if(!Array.isArray(ids)||ids.length===0||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!available.has(id)||!checked.has(id))){
          emit('reject','Result lacks candidate and evidence provenance');return finish('insufficient','The candidate evidence was incomplete.');
        }
        return finish('results',clean(action.message),ids.map(id=>available.get(id)));
      }else{emit('reject','Unknown action type');return finish('insufficient','The agent returned an unsupported action.');}
    }
    emit('limit','Step budget reached');return finish('insufficient','The agent reached its execution limit.');
  }};
}
/** Deterministic stand-in for an LLM. No model calls, no internet and no factual claims. */
export const demoModel={async next({state,events}){
  const q=state.query.toLowerCase();
  if(/\b(hawaii|nevada|utah|colorado|oregon|mexico)\b/.test(q))return {type:'final',status:'unsupported',message:'This MVP focuses on California destinations.'};
  const found=events.find(e=>e.kind==='observation'&&e.name==='find_candidates');
  const evidence=events.find(e=>e.kind==='observation'&&e.name==='check_evidence');
  if(evidence)return {type:'final',status:'results',message:'Here are potential areas to investigate. These are illustrative candidates, not verified recommendations. Live conditions and travel constraints must still be checked.',candidate_ids:evidence.data.map(x=>x.id)};
  if(found)return {type:'tool',name:'check_evidence',args:{candidate_ids:found.data.map(x=>x.id)}};
  let scenario=null;
  if(q.includes('tahoe')&&(q.includes('ski')||q.includes('snowboard'))&&q.includes('run'))scenario='tahoe';
  else if(q.includes('kitesurf')&&(q.includes('spring')||q.includes('march')))scenario='kite';
  else if(q.includes('santa cruz'))scenario='santa';
  if(scenario)return {type:'tool',name:'find_candidates',args:{scenario}};
  if(!sports.some(s=>q.includes(s))&&!/(ski|snowboard|bike|run|surf|kite|hike)/.test(q))return {type:'final',status:'clarify',message:'Which sports would you like to try, and when or where would you like to travel?'};
  return {type:'final',status:'insufficient',message:'This prototype only supports three sample scenarios. Try skiing and trail running in Tahoe, kitesurfing in spring, or exploring Santa Cruz. A live model will handle broader requests.'};
}};
