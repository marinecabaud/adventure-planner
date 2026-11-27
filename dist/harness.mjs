import {normalizeIntent,referenceDateAt,assumptionMessage} from './intent.mjs';
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
export function createHarness({model,fixtures,maxSteps=6,maxCalls=4,weatherTool=null,routeTool=null,activitySearchTool=null,geocodeTool=null,onTrace=()=>{},clock=()=>new Date()}){
  if(typeof model?.next!=='function'&&typeof model?.createSession!=='function')throw new Error('Model adapter must implement next(context) or createSession()');
  return {async run(request){
    const trace=[];const events=[];let calls=0;let available=new Map();let checked=new Set();let geocodingEvidence=[];let weatherEvidence=[];let routeEvidence=[];let normalizedIntent=null;
    const emit=(type,detail)=>{const event={step:trace.length+1,type,detail};trace.push(event);try{onTrace(event)}catch{}};
    function finish(status,message,candidates=[],exploratoryCandidates=[]){
      emit('finish',status);
      const disclosure=assumptionMessage(normalizedIntent);
      return {status,message:disclosure?disclosure+' '+message:message,candidates,exploratoryCandidates,normalizedIntent,weatherEvidence,routeEvidence,geocodingEvidence,trace,metrics:{toolCalls:calls,geocodedCandidates:geocodingEvidence.filter(x=>x.status==='resolved').length,modelSteps:events.filter(x=>x.kind==='decision').length},evidenceMode:activitySearchTool&&normalizedIntent?'web_discovery':'fixture'};
    }
    function unverifiedTransfer(message){
      emit('constraint','Required travel limit not verified');
      const leads=[...available.values()].filter(x=>checked.has(x.id)).slice(0,3);
      const note=leads.length?(normalizedIntent?.responseLanguage==='fr'?' Les lieux ci-dessous sont uniquement des pistes : le temps de trajet demandé n’est pas validé.':' The locations below are exploratory only; the requested travel limit has not been verified.'):'';
      return finish('insufficient',message+note,[],leads);
    }
    if(!clean(request?.query))return finish('clarify','Tell me which sports, dates or destination you have in mind.');
    const state={query:clean(request.query),preferences:{dates:clean(request.preferences?.dates),skill:clean(request.preferences?.skill),origin:clean(request.preferences?.origin),startDate:clean(request.preferences?.startDate),endDate:clean(request.preferences?.endDate),maxTransferMinutes:Number.isFinite(request.preferences?.maxTransferMinutes)&&request.preferences.maxTransferMinutes>0?request.preferences.maxTransferMinutes:null}};
    emit('request','User intent received');
    if(typeof model.extractIntent==='function'){
      try{
        const referenceDate=referenceDateAt(clock());
        normalizedIntent=normalizeIntent(await model.extractIntent({query:state.query,preferences:state.preferences,referenceDate}),state.preferences,referenceDate);
        state.normalizedIntent=normalizedIntent;
        Object.assign(state.preferences,{startDate:normalizedIntent.startDate||'',endDate:normalizedIntent.endDate||'',skill:normalizedIntent.skill||'',origin:normalizedIntent.origin||'',maxTransferMinutes:normalizedIntent.maxTransferMinutes});
        emit('intent','Normalized intent ready');
      }catch{emit('error','Intent normalization failed');return finish('insufficient','I could not understand this request reliably. Please try again.');}
      if(normalizedIntent.scope==='unsupported')return finish('unsupported',normalizedIntent.responseLanguage==='fr'?'Je couvre les destinations en Californie uniquement.':'I cover California destinations only.');
      if(['invalid','ambiguous'].includes(normalizedIntent.dateStatus)){
        const invalid=normalizedIntent.dateStatus==='invalid';
        return finish('clarify',normalizedIntent.responseLanguage==='fr'?(invalid?'La date indiquée ne semble pas valide. Quelle date souhaites-tu ?':'Peux-tu préciser la date que tu souhaites ?'):(invalid?'That date does not seem valid. What date did you mean?':'Could you clarify which date you mean?'));
      }
    }
    const session=typeof model.createSession==='function'?model.createSession():model;
    const liveDiscovery=!!(activitySearchTool&&normalizedIntent?.sports.length);
    const registeredTools=liveDiscovery?[{name:'search_activity_locations',description:'Search real California locations for the normalized request. Returns source-backed provisional candidates, not verified availability.',parameters:{type:'object',properties:{},required:[],additionalProperties:false}},toolDefinitions[1]]:[...toolDefinitions];
    if(liveDiscovery)registeredTools[1]={...toolDefinitions[1],description:'Identify remaining checks for real candidate areas. Does not verify opening or safety.'};
    let searched=false;
    if(weatherTool&&(!normalizedIntent||normalizedIntent.forecastEligible))registeredTools.push({name:'get_weather_forecast',description:'Get short-term NWS weather for an existing candidate and explicit travel dates; does not verify activity availability.',parameters:{type:'object',properties:{candidate_id:{type:'string'}},required:['candidate_id'],additionalProperties:false}});
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
        if(liveDiscovery&&action.name==='search_activity_locations'&&Object.keys(args).length===0&&!searched){
          searched=true;calls++;emit('tool',action.name);
          let result;try{result=await activitySearchTool(normalizedIntent)}catch{result={status:'unavailable',candidates:[]}}
          const records=Array.isArray(result?.candidates)?result.candidates.slice(0,3).filter(x=>x.evidence==='web_discovery'&&x.geography==='California'&&typeof x.sourceUrl==='string'&&x.sourceUrl.startsWith('https://')):[];
          if(geocodeTool&&records.length){
            emit('geocoding_start','geocode_activity_locations');
            for(const candidate of records){
              let geo;try{geo=await geocodeTool(candidate)}catch{}
              const valid=geo?.coordinateEvidence?.status==='resolved'&&Number.isFinite(geo.lat)&&Number.isFinite(geo.lon)&&geo.lat>=32.5&&geo.lat<=42&&geo.lon>=-124.6&&geo.lon<=-114;
              candidate.lat=valid?geo.lat:null;candidate.lon=valid?geo.lon:null;
              candidate.coordinateEvidence=valid?geo.coordinateEvidence:{provider:'Photon / OpenStreetMap',status:['no_match','ambiguous','unavailable'].includes(geo?.coordinateEvidence?.status)?geo.coordinateEvidence.status:'unavailable'};
              geocodingEvidence.push({candidate_id:candidate.id,...candidate.coordinateEvidence});
            }
            emit('geocoding_finish',geocodingEvidence.filter(x=>x.status==='resolved').length+'/'+records.length+' representative locations resolved');
          }
          records.forEach(x=>{available.set(x.id,x);checked.add(x.id)});
          events.push({kind:'observation',name:action.name,data:{status:result?.status||'unavailable',candidates:records}});
        }else if(!liveDiscovery&&action.name==='find_candidates' &&Object.keys(args).length===1&&Object.hasOwn(fixtures,args.scenario)){
          if(!['tahoe','kite','santa'].includes(args.scenario)){emit('reject','Unknown scenario');return finish('insufficient','Unknown demo scenario.');}
          const rows=fixtures[args.scenario].slice(0,3).filter(x=>x.lat>=32.5&&x.lat<=42&&x.lon>=-124.6&&x.lon<=-114);
          const records=rows.map((x,id)=>({id:args.scenario+'-'+id,...x,geography:'California',evidence:'fixture'}));
          records.forEach(x=>available.set(x.id,x));
          calls++;emit('tool',action.name);events.push({kind:'observation',name:action.name,data:records});
        }else if(action.name==='check_evidence'&&Object.keys(args).length===1&&Array.isArray(args.candidate_ids)&&args.candidate_ids.length<=3&&args.candidate_ids.every(id=>available.has(id))){
          const rows=args.candidate_ids.map(id=>({id,requiredChecks:available.get(id).check,verified:false,sourceType:available.get(id).evidence}));rows.forEach(x=>checked.add(x.id));
          calls++;emit('tool',action.name);events.push({kind:'observation',name:action.name,data:rows});
        }else if(weatherTool&&(!normalizedIntent||normalizedIntent.forecastEligible)&&action.name==='get_weather_forecast'&&Object.keys(args).length===1&&available.has(args.candidate_id)&&state.preferences.startDate&&state.preferences.endDate){
          const candidate=available.get(args.candidate_id);
          calls++;emit('tool',action.name);
          let data;
          try{data=Number.isFinite(candidate.lat)&&Number.isFinite(candidate.lon)?await weatherTool({latitude:candidate.lat,longitude:candidate.lon,startDate:state.preferences.startDate,endDate:state.preferences.endDate}):{status:'unavailable',reason:'No sourced coordinates for this location.'};}
          catch{data={status:'unavailable',reason:'Weather MCP call failed.'};}
          if(!data||typeof data.status!=='string')data={status:'unavailable',reason:'Invalid weather tool response.'};
          weatherEvidence.push({candidate_id:candidate.id,data});events.push({kind:'observation',name:action.name,data:{candidate_id:candidate.id,...data}});
        }else if(routeTool&&action.name==='get_drive_estimate'&&Object.keys(args).length===2&&available.has(args.from_candidate_id)&&available.has(args.to_candidate_id)&&args.from_candidate_id!==args.to_candidate_id&&[args.from_candidate_id,args.to_candidate_id].every(id=>Number.isFinite(available.get(id).lat)&&Number.isFinite(available.get(id).lon))){
          const from=available.get(args.from_candidate_id),to=available.get(args.to_candidate_id);
          calls++;emit('tool',action.name);
          let data;
          try{data=await routeTool({from:{latitude:from.lat,longitude:from.lon},to:{latitude:to.lat,longitude:to.lon}});}
          catch{data={status:'unavailable',reason:'Routing API call failed.'};}
          if(!data||!['estimate_available','no_route','unavailable','invalid_request'].includes(data.status)||(data.status==='estimate_available'&&(!Number.isFinite(data.durationSeconds)||data.durationSeconds<0||!Number.isFinite(data.distanceMeters)||data.distanceMeters<0)))data={status:'unavailable',reason:'Invalid routing response.'};
          const limit=state.preferences.maxTransferMinutes;
          const strictLimit=/(?:less than|under|fewer than|moins de|inf[eé]rieur(?:e)? à)\s+\d+\s*(?:minutes?|mins?\b|hours?|heures?)/i.test(state.query);
          const withinLimit=limit!==null&&(strictLimit?data.durationSeconds<limit*60:data.durationSeconds<=limit*60);
          const comparison=data.status==='estimate_available'&&limit!==null?(withinLimit?'within_limit':'exceeds_limit'):'unknown';
          const evidence={from_candidate_id:from.id,to_candidate_id:to.id,maxTransferMinutes:limit,comparison,data};
          routeEvidence.push(evidence);events.push({kind:'observation',name:action.name,data:evidence});
        }else{emit('reject','Unregistered tool or invalid arguments');return finish('insufficient','The agent requested an unsupported research action.');}
      }else if(action.type==='final'){
        if(!outcomes.has(action.status)||!clean(action.message)){emit('reject','Invalid final response');return finish('insufficient','The agent could not produce a valid response.');}
        if(action.status!=='results'){
          // Discovery is not a confirmed itinerary. Preserve sourced leads rather than suppressing
          // them solely because access/condition checks are unavailable for an ordinary request.
          if(action.status==='insufficient'&&liveDiscovery&&available.size&&!normalizedIntent.maxOriginDriveMinutes&&!normalizedIntent.maxTransferMinutes){
            const label=normalizedIntent.responseLanguage==='fr'?' Voici des pistes issues de sources web, et non un itinéraire confirmé. Vérifie les conditions, l’accès et la sécurité avant de partir.':' Here are web-sourced leads, not a confirmed itinerary. Verify conditions, access and safety before visiting.';
            return finish('results',clean(action.message)+label,[...available.values()].slice(0,3));
          }
          if(action.status==='insufficient'&&liveDiscovery&&available.size&&(normalizedIntent.maxOriginDriveMinutes||normalizedIntent.maxTransferMinutes))return unverifiedTransfer(clean(action.message));
          return finish(action.status,clean(action.message));
        }
        const ids=action.candidate_ids;
        if(!Array.isArray(ids)||ids.length===0||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!available.has(id)||!checked.has(id))){
          emit('reject','Result lacks candidate and evidence provenance');return finish('insufficient','The candidate evidence was incomplete.');
        }
        if(liveDiscovery&&(normalizedIntent.maxOriginDriveMinutes||(normalizedIntent.maxTransferMinutes&&!routeEvidence.some(e=>e.comparison==='within_limit'&&ids.length===2&&ids.includes(e.from_candidate_id)&&ids.includes(e.to_candidate_id)&&normalizedIntent.sports.every(s=>[available.get(e.from_candidate_id),available.get(e.to_candidate_id)].some(c=>c.sports?.includes(s)))))))return unverifiedTransfer(normalizedIntent.responseLanguage==='fr'?'Je ne peux pas vérifier la contrainte de trajet.':'I could not verify the required travel limit.');
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
