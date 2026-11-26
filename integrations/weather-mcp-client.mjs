import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
export async function connectWeatherMcp(){
  const client=new Client({name:'adventure-planner',version:'0.2.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:['--use-env-proxy',fileURLToPath(new URL('./weather-mcp-server.mjs',import.meta.url))],env:Object.fromEntries(Object.entries(process.env).filter(([k,v])=>typeof v==='string'&&['PATH','HOME','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','ALL_PROXY','http_proxy','https_proxy','no_proxy','all_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'].includes(k)))});
  await client.connect(transport);
  const tools=(await client.listTools()).tools;
  if(!tools.some(t=>t.name==='get_weather_forecast')){await client.close();throw Error('Weather tool not discovered');}
  return {tools,async weather(args){const result=await client.callTool({name:'get_weather_forecast',arguments:args});const item=result.content.find(c=>c.type==='text');if(!item)throw Error('Empty MCP response');return JSON.parse(item.text);},close:()=>client.close()};
}
