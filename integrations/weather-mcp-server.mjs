import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {getWeatherForecast} from './weather-api.mjs';
const server=new McpServer({name:'adventure-weather',version:'0.2.0'});
server.registerTool('get_weather_forecast',{
  description:'Read NOAA/NWS short-term point forecast for a California candidate and explicit dates; not an activity safety or availability check.',
  inputSchema:{latitude:z.number(),longitude:z.number(),startDate:z.string(),endDate:z.string()},
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}
},async args=>{
  const data=await getWeatherForecast(args);
  return {content:[{type:'text',text:JSON.stringify(data)}],isError:data.status==='invalid_request'||data.status==='unavailable'};
});
await server.connect(new StdioServerTransport());
