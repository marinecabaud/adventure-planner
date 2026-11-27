// Photon / OpenStreetMap: low-volume, read-only representative location lookup.
// Never send private user input or infer coordinates from the LLM.
const geoNormalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const geoAliases=s=>[...new Set([s,...s.split(/\s*[/,]\s*/),s.replace(/\([^)]*\)/g,'')].map(geoNormalize).filter(x=>x.length>3&&!['california','united states'].includes(x)))];
const geoGeneric=new Set(['park','state','national','regional','trail','resort','mountain','ski','beach','area','the','a','of','and','at','lake']);
function geoMatch(name,properties){
  const label=geoNormalize(properties?.name);
  if(!label)return 0;
  let best=0;
  for(const alias of geoAliases(name)){
    if(alias===label){best=Math.max(best,3);continue}
    const a=alias.split(' '),b=label.split(' '),distinct=a.filter(x=>!geoGeneric.has(x));
    const same=a.filter(x=>b.includes(x)).length;
    if(distinct.length&&distinct.every(x=>b.includes(x))&&same>=2&&same/a.length>=.67&&same/b.length>=.67)best=Math.max(best,2);
  }
  return best;
}
const geoResult=(status,extra={})=>({lat:null,lon:null,coordinateEvidence:{provider:'Photon / OpenStreetMap',status,...extra}});
export function parseGeocodingResponse(name,payload){
  const valid=(Array.isArray(payload?.features)?payload.features:[]).flatMap(f=>{
    const p=f?.properties||{},[lon,lat]=Array.isArray(f?.geometry?.coordinates)?f.geometry.coordinates:[];
    const state=geoNormalize(p.state),statecode=String(p.statecode||'').toUpperCase(),country=String(p.countrycode||'').toUpperCase();
    if(f?.geometry?.type!=='Point'||!Number.isFinite(lon)||!Number.isFinite(lat)||lat<32.5||lat>42||lon< -124.6||lon> -114||!(state==='california'||['CA','US-CA'].includes(statecode))||!(country==='US'||(!country&&geoNormalize(p.country)==='united states')))return [];
    const score=geoMatch(name,p);return score?[{lat,lon,score,label:String(p.name).slice(0,150)}]:[];
  }).sort((a,b)=>b.score-a.score);
  if(!valid.length)return geoResult('no_match');
  const best=valid[0];
  if(valid.some(x=>x.score===best.score&&Math.hypot(x.lat-best.lat,x.lon-best.lon)>.015))return geoResult('ambiguous');
  return {lat:best.lat,lon:best.lon,coordinateEvidence:{provider:'Photon / OpenStreetMap',status:'resolved',precision:'representative',label:best.label}};
}
// Cache successful and negative lookups; serialize requests within each isolate.
const geoCache=new Map();let geoQueue=Promise.resolve(),geoLast=0;
export function createGeocoder({fetchFn=fetch,cache=geoCache,minIntervalMs=1100}={}){
  return async candidate=>{
    const name=typeof candidate?.name==='string'?candidate.name.trim().slice(0,150):'';
    if(!name||candidate.geography!=='California')return geoResult('no_match');
    const key=geoNormalize(name);
    const job=geoQueue.then(async()=>{
      const cached=cache.get(key);if(cached&&Date.now()-cached.time<86400000)return structuredClone(cached.result);
      const delay=Math.max(0,minIntervalMs-(Date.now()-geoLast));if(delay)await new Promise(r=>setTimeout(r,delay));
      geoLast=Date.now();
      try{
        const url=new URL('https://photon.komoot.io/api/');
        url.search=new URLSearchParams({q:name+', California',limit:'5',bbox:'-124.6,32.5,-114,42',lang:'en'});
        const response=await fetchFn(url.toString(),{signal:AbortSignal.timeout(5500),headers:{Accept:'application/json'}});
        if(!response.ok)return geoResult('unavailable');
        const result=parseGeocodingResponse(name,await response.json());
        if(cache.size>=256)cache.delete(cache.keys().next().value);
        cache.set(key,{time:Date.now(),result});return structuredClone(result);
      }catch{return geoResult('unavailable')}
    });geoQueue=job.catch(()=>{});return job;
  };
}
