/** Read-only OSRM demo adapter. Zone-to-zone estimates, not live road conditions. */
const base='https://router.project-osrm.org';
let nextDemoRequestAt=0;
async function publicDemoFetch(url,options){
  const start=Math.max(Date.now(),nextDemoRequestAt);
  nextDemoRequestAt=start+1100;
  const wait=start-Date.now();
  if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
  return fetch(url,{...options,signal:AbortSignal.timeout(12000)});
}
const limitations=['Representative area coordinates, not exact entrances or activity sites.','Estimated driving time without live traffic, closures, weather or seasonal access checks.','Public OSRM demo service; development/non-commercial testing only.'];
const valid=p=>p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>=32.5&&p.latitude<=42&&p.longitude>=-124.6&&p.longitude<=-114;
export async function getDriveEstimate({from,to}={}, {fetchFn=publicDemoFetch,now=new Date()}={}){
  const meta={source:'OSRM public demo / OpenStreetMap',sourceUrl:base,retrievedAt:now.toISOString(),limitations};
  if(!valid(from)||!valid(to))return {...meta,status:'invalid_request',reason:'Expected representative coordinates in the California bounding box.'};
  const coord=p=>p.longitude.toFixed(5)+','+p.latitude.toFixed(5);
  const url=base+'/route/v1/driving/'+coord(from)+';'+coord(to)+'?overview=false&steps=false&alternatives=false';
  try{
    const response=await fetchFn(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'AdventurePlanner-DevelopmentDemo/0.3'}});
    const data=await response.json();
    if(data?.code==='NoRoute'||data?.code==='NoSegment')return {...meta,sourceUrl:url,status:'no_route',reason:'The routing engine could not find a usable route.'};
    if(!response.ok||data?.code!=='Ok')return {...meta,sourceUrl:url,status:'unavailable',reason:'Routing provider returned an error.'};
    const route=data.routes?.[0];
    if(!route||!Number.isFinite(route.duration)||route.duration<0||!Number.isFinite(route.distance)||route.distance<0)return {...meta,sourceUrl:url,status:'unavailable',reason:'Incomplete routing response.'};
    return {...meta,sourceUrl:url,status:'estimate_available',durationSeconds:route.duration,distanceMeters:route.distance};
  }catch{return {...meta,sourceUrl:url,status:'unavailable',reason:'Routing request failed or timed out.'};}
}
