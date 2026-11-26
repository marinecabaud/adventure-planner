import {createHarness} from '../dist/harness.mjs';
import {fixtures} from '../dist/fixtures.mjs';
import {createOpenAIModel,defaultModel} from '../models/openai-model.mjs';
import {connectWeatherMcp} from './weather-mcp-client.mjs';
import {getDriveEstimate} from './routing-api.mjs';

const query=process.argv[2];
if(!query?.trim()){
  console.error('Usage: npm run agent:live -- "Your trip request" \'{"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","maxTransferMinutes":60}\'');
  process.exitCode=1;
}else{
  let mcp;
  try{
    const preferences=JSON.parse(process.argv[3]||'{}');
    if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))throw Error('Preferences must be a JSON object.');
    const model=createOpenAIModel({onError:message=>console.error(message)});
    mcp=await connectWeatherMcp();
    const result=await createHarness({model,fixtures,weatherTool:mcp.weather,routeTool:getDriveEstimate,maxSteps:7,maxCalls:6}).run({query,preferences});
    console.log(JSON.stringify({model:process.env.OPENAI_MODEL||defaultModel,...result,limitations:['Candidate inventory is illustrative, not verified.','Exact activity locations, opening status, safety and road access are not verified.']},null,2));
  }catch(error){
    console.error(error.message==='OPENAI_API_KEY is required. Set it in a local .env file or environment variable.'?error.message:'Agent setup failed. Check the local configuration, JSON preferences and MCP installation.');
    process.exitCode=1;
  }finally{if(mcp)await mcp.close();}
}
