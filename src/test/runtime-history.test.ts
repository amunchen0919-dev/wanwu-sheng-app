// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {runtimeDiagnostic} from '../../server/runtime';
import {createLab} from '../../server/app';
import type {HistoricalJob} from '../../server/history';
async function connect(handle:ReturnType<typeof createLab>){return(await handle(new Request('http://localhost:8787/api/audio-lab/config'))).json();}
function request(token:string,path:string,body?:unknown){return new Request(`http://localhost:8787/api/audio-lab/${path}`,{method:body?'POST':'GET',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
const id='22222222-2222-4222-8222-222222222222';
describe('真实模式诊断与历史隔离（绝不调用上游）',()=>{
 it('进程Mock覆盖文件Live时明确报告差异，只返回密钥布尔值',()=>{
  const runtime=runtimeDiagnostic({STABLE_AUDIO_MODE:'mock',STABILITY_API_KEY:'secret-never-print'},()=> 'STABLE_AUDIO_MODE=live\nSTABILITY_API_KEY=secret-never-print');
  expect(runtime).toMatchObject({requestedMode:'mock',effectiveMode:'mock',envFileMode:'live',keyConfigured:true});expect(runtime.explanation).toContain('覆盖');expect(JSON.stringify(runtime)).not.toContain('secret-never-print');expect(runtime.pid).toBeGreaterThan(0);
 });
 it('显式Live只有密钥加载才生效，配置接口反映实际进程而不是文件猜测',async()=>{
  const diagnostic=runtimeDiagnostic({STABLE_AUDIO_MODE:'live',STABILITY_API_KEY:'fake'},()=> 'STABLE_AUDIO_MODE=mock');
  const config=await connect(createLab({enabled:true,mode:'live',key:'fake',runtime:diagnostic}));expect(config.mode).toBe('live');expect(config.runtime.effectiveMode).toBe('live');expect(config.generationModes).toContain('text-to-audio');
  const missing=runtimeDiagnostic({STABLE_AUDIO_MODE:'live'},()=> 'STABLE_AUDIO_MODE=live');expect(missing.effectiveMode).toBe('mock');expect(missing.explanation).toContain('未加载有效密钥');
 });
 it('Live服务可识别并免费恢复完成Mock任务，不当作丢失，不向Live提交或查询',async()=>{
  const provider={submit:vi.fn(),result:vi.fn()},history:HistoricalJob[]=[{executionMode:'mock',record:{id,status:'complete',generationMode:'text-to-audio',duration:90}}];
  const handle=createLab({enabled:true,mode:'live',key:'fake',history:()=>history},provider),config=await connect(handle);
  expect(await(await handle(request(config.token,`jobs/${id}/status`))).json()).toMatchObject({state:'complete',executionMode:'mock',requiresModeSwitch:false,canPrepare:false});
  const result=await handle(request(config.token,`jobs/${id}`));expect(result.status).toBe(200);expect(result.headers.get('x-audio-mode')).toBe('mock');const view=new DataView(await result.arrayBuffer());expect(view.getUint32(40,true)/(view.getUint32(24,true)*2)).toBe(90);
  expect(history[0].record.status).toBe('complete');expect(provider.submit).not.toHaveBeenCalled();expect(provider.result).not.toHaveBeenCalled();
 });
 it('Mock服务发现历史Live未知任务仅提示切回账户，禁止误归档或自动查询',async()=>{
  const provider={submit:vi.fn(),result:vi.fn()},history:HistoricalJob[]=[{executionMode:'live',record:{id,status:'error',failure:{submissionUnknown:true}}}];
  const handle=createLab({enabled:true,mode:'mock',history:()=>history,journal:{read:()=>[],write:vi.fn()}},provider),config=await connect(handle);
  expect(await(await handle(request(config.token,`jobs/${id}/status`))).json()).toMatchObject({state:'unknown',executionMode:'live',requiresModeSwitch:true,canManualRecover:false});
  expect((await handle(request(config.token,`jobs/${id}`))).status).toBe(409);
  expect((await handle(request(config.token,`jobs/${id}/manual-recovery`,{typedId:id}))).status).toBe(409);expect(provider.result).not.toHaveBeenCalled();expect(provider.submit).not.toHaveBeenCalled();
 });
 it('同ID多来源不自动选择，历史列表保留所有记录不删除',async()=>{
  const history:HistoricalJob[]=['mock','live'].map(mode=>({executionMode:mode as 'mock'|'live',record:{id,status:'complete'}}));
  const handle=createLab({enabled:true,mode:'mock',history:()=>history}),config=await connect(handle);
  expect((await handle(request(config.token,`jobs/${id}/status`))).status).toBe(409);const registry=await(await handle(request(config.token,'jobs'))).json();expect(registry.records).toHaveLength(2);expect(history).toHaveLength(2);
 });
});
