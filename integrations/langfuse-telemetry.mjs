/** Dependency-free OTLP/HTTP exporter for the hosted Worker.
 * Only bounded execution metadata is exported: never prompts, tool arguments,
 * response text, coordinates, visitor identity, or credentials. */
const lfHosts=new Set(['https://us.cloud.langfuse.com','https://cloud.langfuse.com','https://jp.cloud.langfuse.com']);
const lfTools=new Set(['find_candidates','check_evidence','get_weather_forecast','get_drive_estimate']);
const lfOutcomes=new Set(['results','clarify','unsupported','insufficient']);
const lfProviderStates=new Set(['forecast_available','partial','outside_forecast_horizon','unavailable','invalid_request','estimate_available','no_route']);
const lfRandom=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
const lfTime=()=>String(BigInt(Date.now())*1000000n);
const lfAttr=(key,value)=>({key,value:{stringValue:typeof value==='string'?value:JSON.stringify(value)}});
const lfStatus=x=>lfOutcomes.has(x)?x:'unknown';
const lfObs=x=>({status:lfProviderStates.has(x?.status)?x.status:lfProviderStates.has(x?.data?.status)?x.data.status:undefined,count:Array.isArray(x)?x.length:undefined,comparison:['within_limit','exceeds_limit','unknown'].includes(x?.comparison)?x.comparison:undefined});
export function createLangfuseTrace(env,{fetchFn=fetch}={}){
  const traceId=lfRandom(16),rootId=lfRandom(8),started=lfTime(),spans=[];
  let pendingTool=null,usage=null,generation=0,closed=false,exportStatus="not_attempted";
  const span=(name,type,begin,output,extra=[],error=false,id=lfRandom(8),parent=rootId)=>({
    traceId,spanId:id,...(parent?{parentSpanId:parent}:{}),name,kind:1,
    startTimeUnixNano:begin,endTimeUnixNano:lfTime(),
    attributes:[lfAttr('langfuse.trace.name','Adventure Planner /api/plan'),lfAttr('langfuse.environment','production'),lfAttr('langfuse.observation.type',type),lfAttr('langfuse.observation.output',output),...extra],
    status:{code:error?2:1}
  });
  function closeTool(data,error=false){
    if(!pendingTool)return;
    const output=lfObs(data);spans.push(span(pendingTool.name,'tool',pendingTool.start,output,[],error||['unavailable','invalid_request'].includes(output.status)));pendingTool=null;
  }
  const config=()=>{const base=String(env.LANGFUSE_BASE_URL||'').replace(/\/$/,'');return lfHosts.has(base)&&typeof env.LANGFUSE_PUBLIC_KEY==='string'&&env.LANGFUSE_PUBLIC_KEY.startsWith('pk-lf-')&&typeof env.LANGFUSE_SECRET_KEY==='string'&&env.LANGFUSE_SECRET_KEY.startsWith('sk-lf-')?base:null};
  return {
    traceId,
    get exportStatus(){return exportStatus},
    onTrace(event){if(event.type==='tool'&&lfTools.has(event.detail)){closeTool(undefined,true);pendingTool={name:event.detail,start:lfTime()}}},
    onUsage(value){usage=value},
    wrapModel(model,name){
      return {createSession(){const session=typeof model.createSession==='function'?model.createSession():model;return {async next(context){
        const last=context.events.at(-1);if(last?.kind==='observation')closeTool(last.data);
        const start=lfTime(),index=++generation;usage=null;
        let output={decision:'error'},failed=false;
        try{
          const action=await session.next(context);
          output=action?.type==='tool'?{decision:'tool',tool:lfTools.has(action.name)?action.name:'unregistered'}:action?.type==='final'?{decision:'final',status:lfStatus(action.status)}:{decision:'invalid'};
          return action;
        }catch(error){failed=true;throw error}
        finally{
          const attributes=[lfAttr('langfuse.observation.model.name',name)];
          if(usage&&Number.isSafeInteger(usage.input_tokens)&&Number.isSafeInteger(usage.output_tokens)&&usage.input_tokens>=0&&usage.output_tokens>=0)attributes.push(lfAttr('langfuse.observation.usage_details',{input:usage.input_tokens,output:usage.output_tokens,total:usage.input_tokens+usage.output_tokens}));
          spans.push(span('LLM decision '+index,'generation',start,output,attributes,failed));
        }
      }}}};
    },
    finish({httpStatus,result,inputMetadata={},errorCode}){
      if(closed)return;closed=true;closeTool(undefined,true);
      const output={httpStatus,status:lfStatus(result?.status),toolCalls:result?.metrics?.toolCalls??0,modelSteps:result?.metrics?.modelSteps??0,candidates:result?.candidates?.length??0,...(errorCode?{errorCode}:{} )};
      spans.push(span('Adventure Planner /api/plan','agent',started,output,[lfAttr('langfuse.observation.input',inputMetadata)],httpStatus>=400,rootId,null));
    },
    async export(){
      const base=config();if(!base||!closed){exportStatus='not_configured';return false}
      let stage='authorization';
      try{
        const keys=[env.LANGFUSE_PUBLIC_KEY.trim(),env.LANGFUSE_SECRET_KEY.trim()];
        if(!keys.every(k=>/^[\x21-\x7E]+$/.test(k))){exportStatus='invalid_key_format';console.warn('Langfuse '+exportStatus+' trace '+traceId);return false}
        const auth='Basic '+btoa(keys.join(':'));
        stage='encode';
        const body=JSON.stringify({resourceSpans:[{resource:{attributes:[lfAttr('service.name','adventure-planner')]},scopeSpans:[{scope:{name:'adventure-planner.harness'},spans}]}]});
        stage='fetch';
        // Manual redirects expose a redirect error without forwarding credentials.
        const response=await fetchFn(base+'/api/public/otel/v1/traces',{method:'POST',redirect:'manual',headers:{'Authorization':auth,'Content-Type':'application/json','x-langfuse-ingestion-version':'4'},body,signal:AbortSignal.timeout(8000)});
        if(!response.ok){exportStatus='http_'+response.status;console.warn('Langfuse '+exportStatus+' trace '+traceId);return false}
        stage='response';
        // OTLP may accept a request but reject one or more spans.
        const receipt=await response.json().catch(()=>null);
        if(Number(receipt?.partialSuccess?.rejectedSpans)>0){exportStatus='partial_rejection';console.warn('Langfuse '+exportStatus+' trace '+traceId);return false}
        exportStatus='exported';console.info('Langfuse trace exported '+traceId);
        return true;
      }catch(e){
        const name=e?.name||'',message=typeof e?.message==='string'?e.message:'';
        const reason=/timeout|timed out/i.test(message)||name==='TimeoutError'?'timeout':/redirect/i.test(message)?'redirect':/blocked|denied|disallowed|not permitted|forbidden|policy/i.test(message)?'blocked':/dns|resolve|host not found/i.test(message)?'dns':/tls|certificate|ssl/i.test(message)?'tls':/network|fetch failed|connect|socket/i.test(message)?'network':name==='AbortError'?'aborted':name==='InvalidCharacterError'?'invalid_character':name==='TypeError'?'type_error':'unknown';
        exportStatus=stage+'_'+reason;console.warn('Langfuse '+exportStatus+' trace '+traceId);
        return false;
      }
    }
  };
}
