import {runtimeDiagnostic} from './runtime.ts';
import {readHistory} from './history.ts';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {fileJournal} from './journal.ts';
import { createServer } from 'node:http';
import { createLab } from './app.ts';
const port=8787;
const runtime=runtimeDiagnostic();
const handle=createLab({enabled:process.env.ENABLE_AUDIO_LAB==='true'&&process.env.NODE_ENV!=='production',mode:process.env.STABLE_AUDIO_MODE==='live'?'live':'mock',key:process.env.STABILITY_API_KEY,runtime,history:()=>readHistory(fileURLToPath(new URL('../.audio-lab',import.meta.url))),journal:process.env.STABLE_AUDIO_MODE==='live'&&process.env.STABILITY_API_KEY?fileJournal(fileURLToPath(new URL(`../.audio-lab/jobs-${createHash('sha256').update(process.env.STABILITY_API_KEY.trim()).digest('hex').slice(0,16)}.json`,import.meta.url))):fileJournal(fileURLToPath(new URL('../.audio-lab/jobs-mock.json',import.meta.url)))});
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!['localhost:8787','127.0.0.1:8787'].includes(req.headers.host??'')){res.writeHead(403).end();return;}
  try {
    const chunks:Buffer[]=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>7_000_000){res.writeHead(413).end('Request too large');return;}chunks.push(Buffer.from(chunk));}
    const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value) headers.set(name,Array.isArray(value)?value.join(','):value);
    const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
    const response=await handle(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'本地服务处理失败'}));}
});
server.requestTimeout=120000;
server.on('error',(error:NodeJS.ErrnoException)=>{console.error(`本地测试服务无法监听端口8787：${error.code ?? 'UNKNOWN'}。本次新服务未启动，浏览器可能仍连接旧服务。请先在原终端Ctrl+C停止8787服务，再重新启动。`);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log(`万物声本地测试后端 http://127.0.0.1:${port} （密钥不输出）`);console.info('[audio-lab] startup',runtime);});
