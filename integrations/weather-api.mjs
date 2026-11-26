// NWS official API: https://www.weather.gov/documentation/services-web-api
const source='NOAA / National Weather Service';
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const dateAt=(d,tz)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const dayMs=86400000;
export async function getWeatherForecast({latitude,longitude,startDate,endDate}, {fetchFn=fetch,now=new Date()}={}){
  const retrievedAt=now.toISOString();
  const result=(status,extra={})=>({status,source,retrievedAt,latitude,longitude,startDate,endDate,...extra});
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<32.5||latitude>42||longitude< -124.6||longitude> -114||!validDate(startDate)||!validDate(endDate)||endDate<startDate)return result('invalid_request',{reason:'Coordinates must be within the California bounding box and dates must be valid ISO dates.'});
  const today=dateAt(now,'America/Los_Angeles');
  if(startDate<today||Date.parse(endDate)-Date.parse(today)>6*dayMs)return result('outside_forecast_horizon',{reason:'NWS short-term forecast only. Use climatology for longer-term planning; no forecast invented.'});
  const headers={'User-Agent':'AdventurePlannerPrototype/0.2','Accept':'application/geo+json'};
  async function request(url){
    const r=await fetchFn(url,{headers,signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!r.ok)throw new Error('NWS HTTP '+r.status);
    return r.json();
  }
  try{
    const pointUrl='https://api.weather.gov/points/'+latitude.toFixed(4)+','+longitude.toFixed(4);
    const point=await request(pointUrl);
    const forecastUrl=point.properties?.forecast;
    if(typeof forecastUrl!=='string'||!/^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z]+\/\d+,\d+\/forecast$/.test(forecastUrl))return result('unavailable',{reason:'No trusted NWS forecast endpoint returned.',sourceUrl:pointUrl});
    const data=await request(forecastUrl);
    const periods=(data.properties?.periods??[]).filter(p=>typeof p.startTime==='string'&&p.startTime.slice(0,10)>=startDate&&p.startTime.slice(0,10)<=endDate).map(p=>({name:p.name,startTime:p.startTime,endTime:p.endTime,temperature:p.temperature,temperatureUnit:p.temperatureUnit,windSpeed:p.windSpeed,windDirection:p.windDirection,precipitationProbability:p.probabilityOfPrecipitation?.value??null,shortForecast:p.shortForecast}));
    const dates=new Set(periods.map(p=>p.startTime.slice(0,10)));
    const required=[];for(let t=Date.parse(startDate);t<=Date.parse(endDate);t+=dayMs)required.push(new Date(t).toISOString().slice(0,10));
    return result(required.every(d=>dates.has(d))?'forecast_available':periods.length?'partial':'unavailable',{sourceUrl:forecastUrl,issuedAt:data.properties?.generatedAt??data.properties?.updateTime??null,periods,missingDates:required.filter(d=>!dates.has(d)),limitations:'Point forecast only; does not establish trail/resort openings, marine conditions, skill suitability, or activity safety.'});
  }catch(e){return result('unavailable',{reason:'NWS request failed or timed out.',detail:e.message});}
}
