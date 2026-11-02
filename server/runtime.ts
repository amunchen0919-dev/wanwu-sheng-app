import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export type RuntimeDiagnostic={pid:number;instanceId:string;startedAt:string;requestedMode:string;effectiveMode:'live'|'mock';envFileMode:string;keyConfigured:boolean;explanation:string};
export function runtimeDiagnostic(env:NodeJS.ProcessEnv=process.env,readEnv:()=>string=()=>readFileSync(new URL('../.env',import.meta.url),'utf8')):RuntimeDiagnostic{
 let envFileMode='未设置';try{const line=readEnv().split(/\r?\n/).find(l=>/^\s*STABLE_AUDIO_MODE\s*=/.test(l));if(line){const value=line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');envFileMode=['live','mock'].includes(value)?value:'无效值';}}catch{/* 只用于诊断，不替代启动环境 */}
 const requestedMode=env.STABLE_AUDIO_MODE==='live'?'live':'mock',keyConfigured=!!env.STABILITY_API_KEY?.trim(),effectiveMode=requestedMode==='live'&&keyConfigured?'live':'mock';
 const explanation=requestedMode==='live'&&!keyConfigured?'进程请求Live但未加载有效密钥，安全回退Mock；检查启动方式，不要把密钥放入VITE变量':envFileMode!==requestedMode&&['live','mock'].includes(envFileMode)?'当前进程模式与.env不同：启动命令或继承环境可能覆盖.env，或文件在启动后修改；修改.env不会更新已运行进程':effectiveMode==='live'?'当前后端实际为Live；仍须当次确认费用并主动点击才生成':'当前后端实际为Mock，不调用AI；要切Live需停止旧服务并使用明确的Live启动命令';
 return{pid:process.pid,instanceId:randomUUID(),startedAt:new Date().toISOString(),requestedMode,effectiveMode,envFileMode,keyConfigured,explanation};
}
