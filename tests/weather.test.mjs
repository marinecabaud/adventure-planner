import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getWeatherForecast} from '../integrations/weather-api.mjs';
import {createHarness} from '../dist/harness.mjs';
import {fixtures} from '../dist/fixtures.mjs';
import {connectWeatherMcp} from '../integrations/weather-mcp-client.mjs';
const now=new Date('2026-11-26T18:00:00Z');
const args={latitude:38.94,longitude:-119.98,startDate:'2026-11-27',endDate:'2026-11-28'};
const endpoint='https://api.weather.gov/gridpoints/REV/34,81/forecast';
const row=d=>({name:'Day',startTime:d+'T06:00:00-08:00',temperature:40,temperatureUnit:'F',shortForecast:'Fixture',probabilityOfPrecipitation:{value:20}});
function fake(periods){const urls=[];return {urls,fetchFn:async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/points/')?{properties:{forecast:endpoint}}:{properties:{generatedAt:'2026-11-26T18:00:00Z',periods}}}}}}
test('NWS two-step lookup and date-fenced evidence',async()=>{const f=fake([row('2026-11-26'),row('2026-11-27'),row('2026-11-28')]);const r=await getWeatherForecast(args,{now,fetchFn:f.fetchFn});assert.equal(r.status,'forecast_available');assert.equal(r.periods.length,2);assert.deepEqual(f.urls,['https://api.weather.gov/points/38.9400,-119.9800',endpoint]);assert.equal(r.sourceUrl,endpoint)});
test('long-term dates never call forecast API',async()=>{const r=await getWeatherForecast({...args,endDate:'2027-02-01'},{now,fetchFn:()=>assert.fail('unexpected network call')});assert.equal(r.status,'outside_forecast_horizon')});
test('out of geographic bounding box rejected',async()=>{const r=await getWeatherForecast({...args,latitude:21.3},{now,fetchFn:()=>assert.fail('unexpected network call')});assert.equal(r.status,'invalid_request')});
test('partial forecast marks missing dates',async()=>{const f=fake([row('2026-11-27')]);const r=await getWeatherForecast(args,{now,fetchFn:f.fetchFn});assert.equal(r.status,'partial');assert.deepEqual(r.missingDates,['2026-11-28'])});
test('API failure degrades gracefully',async()=>{const r=await getWeatherForecast(args,{now,fetchFn:async()=>({ok:false,status:503})});assert.equal(r.status,'unavailable');assert.equal(r.periods,undefined)});
test('third-party forecast URL is rejected',async()=>{const r=await getWeatherForecast(args,{now,fetchFn:async()=>({ok:true,json:async()=>({properties:{forecast:'https://example.com'}})})});assert.equal(r.status,'unavailable')});
test('MCP server discovery and invalid request without network',async()=>{const c=await connectWeatherMcp();try{assert.ok(c.tools.some(t=>t.name==='get_weather_forecast'));const r=await c.weather({...args,latitude:0});assert.equal(r.status,'invalid_request')}finally{await c.close()}});
test('harness uses weather tool only for discovered candidate and explicit dates',async()=>{let n=0;const actions=[{type:'tool',name:'find_candidates',args:{scenario:'tahoe'}},{type:'tool',name:'check_evidence',args:{candidate_ids:['tahoe-0']}},{type:'tool',name:'get_weather_forecast',args:{candidate_id:'tahoe-0'}},{type:'final',status:'results',message:'Illustrative only',candidate_ids:['tahoe-0']}];const r=await createHarness({fixtures,model:{next:async()=>actions[n++]},weatherTool:async a=>{assert.equal(a.latitude,fixtures.tahoe[0].lat);assert.equal(a.startDate,args.startDate);return {status:'forecast_available',periods:[]}}}).run({query:'Tahoe',preferences:args});assert.equal(r.metrics.toolCalls,3);assert.equal(r.weatherEvidence.length,1)});
