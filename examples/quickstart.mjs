// Offline introduction to the existing harness. No API calls or credentials.
import {createHarness,demoModel} from '../dist/harness.mjs';
import {fixtures} from '../dist/fixtures.mjs';

const query=process.argv.slice(2).join(' ') || 'I want to ski and trail run in Tahoe.';
const result=await createHarness({model:demoModel,fixtures,maxSteps:7,maxCalls:6}).run({query});

console.log(JSON.stringify({
  mode:'offline_fixture_demo',
  disclaimer:'Illustrative candidates only. No live searches, forecasts, routing or LLM calls.',
  ...result
},null,2));
