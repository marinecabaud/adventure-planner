import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeSelection,runToolSelection} from './run-tool-selection.mjs';
const scenario={required:['find_candidates','get_weather_forecast'],forbidden:['get_drive_estimate'],allowedFixtureScenarios:['tahoe'],missingCapabilities:['resort_openings']};
test('required, forbidden, relevant scenario and order pass',()=>assert.ok(gradeSelection(scenario,[{name:'find_candidates',args:{scenario:'tahoe'}},{name:'get_weather_forecast'}]).every(c=>c.status==='pass')));
test('wrong fixture, missing weather and unwanted route fail',()=>assert.deepEqual(gradeSelection(scenario,[{name:'find_candidates',args:{scenario:'santa'}},{name:'get_drive_estimate'}]).filter(c=>c.status==='fail').map(c=>c.criterion),['required:get_weather_forecast','forbidden:get_drive_estimate','fixture_scope']));
test('evidence before discovery fails',()=>assert.equal(gradeSelection(scenario,[{name:'get_weather_forecast'},{name:'find_candidates',args:{scenario:'tahoe'}}]).find(c=>c.criterion==='discovery_before_evidence').status,'fail'));
test('runner records only accepted tool actions',async()=>{
 const actions=[{type:'tool',name:'find_candidates',args:{scenario:'tahoe'}},{type:'tool',name:'unregistered',args:{}},{type:'final',status:'insufficient',message:'test'}];
 const r=await runToolSelection({limit:1,apiKey:'mock',modelFactory:()=>({next:async()=>actions.shift()})});assert.equal(r.rows[0].calls.length,1);assert.equal(r.rows[0].attempts.length,2);assert.equal(r.rows[0].calls[0].args.scenario,'tahoe');assert.equal(r.summary.scenariosWithMissingCapabilities,1);
});

test('forbidden attempts rejected by harness still fail selection',()=>assert.equal(gradeSelection(scenario,[],[{name:'get_drive_estimate'}]).find(c=>c.criterion==='forbidden:get_drive_estimate').status,'fail'));
