// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLab, validateReference } from '../../server/app';
import { StableAudioProvider } from '../../server/provider';
beforeEach(()=>{vi.spyOn(console,'info').mockImplementation(()=>{});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function audio(channels=2){const buffer=new ArrayBuffer(44+30*44100*channels*2),v=new DataView(buffer);const text=(o:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));text(0,'RIFF');text(8,'WAVE');text(12,'fmt ');text(36,'data');v.setUint32(4,buffer.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(28,44100*channels*2,true);v.setUint16(32,channels*2,true);v.setUint32(24,44100,true);v.setUint16(34,16,true);v.setUint32(40,buffer.byteLength-44,true);return new Blob([buffer],{type:'audio/wav'});}
async function connect(handle:ReturnType<typeof createLab>){return (await handle(new Request('http://localhost:8787/api/audio-lab/config'))).json();}
function submit(token:string,id='request-1234567890123456',confirmed='yes'){const form=new FormData();form.set('audio',audio(),'reference.wav');form.set('prompt','Instrumental only. No vocals.');form.set('strength','.6');form.set('confirmed',confirmed);return new Request('http://localhost:8787/api/audio-lab/jobs',{method:'POST',headers:{'X-Lab-Token':token,'X-Request-Id':id},body:form});}
describe('服务端实验室（绝不使用真实密钥或真实fetch）',()=>{
  it('同时接受旧单声道与新双声道标准WAV，拒绝不一致的块对齐',async()=>{
    await expect(validateReference(audio(1))).resolves.toMatchObject({channels:1,duration:30});
    await expect(validateReference(audio(2))).resolves.toMatchObject({channels:2,duration:30});
    const bytes=await audio(2).arrayBuffer();new DataView(bytes).setUint16(32,2,true);
    await expect(validateReference(new Blob([bytes]))).rejects.toThrow('PCM16');
  });
  it('默认无密钥即Mock，不调用提供者，结果为输入音频',async()=>{
    const provider={submit:vi.fn(),result:vi.fn()};const handle=createLab({enabled:true,mode:'live'},provider);const config=await connect(handle);
    expect(config.mode).toBe('mock');expect(config.key).toBeUndefined();
    expect((await handle(submit(config.token))).status).toBe(202);
    expect((await handle(new Request('http://localhost:8787/api/audio-lab/jobs/request-1234567890123456',{headers:{'X-Lab-Token':config.token}}))).status).toBe(202);
    const response=await handle(new Request('http://localhost:8787/api/audio-lab/jobs/request-1234567890123456',{headers:{'X-Lab-Token':config.token}}));
    expect(response.status).toBe(200);expect((await response.blob()).size).toBe(audio().size);expect(provider.submit).not.toHaveBeenCalled();
  });
  it('需要明确确认，重复ID与并发不重复提交，结果查询不再生成',async()=>{
    const provider={submit:vi.fn(async()=>({upstreamId:'a'.repeat(64)})),result:vi.fn(async()=>new Blob(['mp3'],{type:'audio/mpeg'}))};
    const handle=createLab({enabled:true,mode:'live',key:'fake-test-key'},provider);const config=await connect(handle);
    expect((await handle(submit(config.token,undefined,'no'))).status).toBe(400);expect(provider.submit).not.toHaveBeenCalled();
    const responses=await Promise.all([handle(submit(config.token)),handle(submit(config.token))]);
    expect(responses.every(response=>response.status===202)).toBe(true);expect(provider.submit).toHaveBeenCalledOnce();
    expect((await handle(submit(config.token,'another-1234567890123456'))).status).toBe(409);
    expect((await handle(new Request('http://localhost:8787/api/audio-lab/jobs/request-1234567890123456',{headers:{'X-Lab-Token':config.token}}))).status).toBe(200);
    expect(provider.submit).toHaveBeenCalledOnce();
  });
  it('拒绝跨站/无token/关闭开发模式，错误不会自动重试',async()=>{
    const provider={submit:vi.fn(async()=>{throw Error('network');}),result:vi.fn()};const handle=createLab({enabled:true,mode:'live',key:'test'},provider);const config=await connect(handle);
    expect((await handle(new Request('http://localhost:8787/api/audio-lab/config',{headers:{Origin:'https://evil.example'}}))).status).toBe(403);
    expect((await handle(submit('invalid'))).status).toBe(403);
    expect((await createLab({enabled:false,mode:'mock'})(new Request('http://localhost:8787/api/audio-lab/config'))).status).toBe(404);
    expect((await handle(submit(config.token))).status).toBe(502);expect((await handle(submit(config.token))).status).toBe(409);expect(provider.submit).toHaveBeenCalledOnce();
  });
  it('提供者发送官方multipart字段并处理202异步结果，密钥仅在服务端header',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({id:'b'.repeat(64)},{status:202})).mockResolvedValueOnce(new Response(null,{status:202})).mockResolvedValueOnce(new Response(new Blob(['mp3']),{headers:{'content-type':'audio/mpeg'}}));
    const provider=new StableAudioProvider('fake-secret',fetcher);await provider.submit({audio:audio(),prompt:'No vocals.',strength:.6});
    const options=fetcher.mock.calls[0][1];expect(options.headers.Authorization).toBe('Bearer fake-secret');
    const decoded=await new Request(fetcher.mock.calls[0][0],options).formData();
    expect([...decoded.keys()].sort()).toEqual(['audio','duration','model','output_format','prompt','strength']);
    expect(decoded.get('duration')).toBe('30');expect(decoded.get('model')).toBe('stable-audio-3');
    expect(decoded.get('prompt')).toBe('No vocals.');
    expect((decoded.get('audio') as File).size).toBe(audio().size);
    expect(options.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(options.headers['Content-Length']).toBe(String(options.body.size));
    const wire=Buffer.from(await options.body.arrayBuffer());
    expect(wire.toString('utf8').indexOf('name="prompt"')).toBeLessThan(wire.toString('utf8').indexOf('name="audio"'));
    expect(wire.subarray(-2).toString()).toBe('\r\n');
    expect(await provider.result('b'.repeat(64))).toBeUndefined();expect((await provider.result('b'.repeat(64)))?.size).toBe(3);
    expect(fetcher.mock.calls[1][0]).toContain('/v2beta/audio/results/');
  });
  it('上游错误显示合理原因并清除密钥，非法参考不调用上游',async()=>{
    const fetcher=vi.fn(async()=>Response.json({name:'payment_required',errors:['fake-secret sk-hidden-value']},{status:402}));
    await expect(new StableAudioProvider('fake-secret',fetcher).submit({audio:audio(),prompt:'p',strength:.6})).rejects.toThrow('额度不足');
    try{await new StableAudioProvider('fake-secret',fetcher).submit({audio:audio(),prompt:'p',strength:.6});}catch(e){expect((e as Error).message).not.toContain('fake-secret');expect((e as Error).message).not.toContain('sk-hidden');}
    const provider={submit:vi.fn(),result:vi.fn()};const handle=createLab({enabled:true,mode:'live',key:'test'},provider);const config=await connect(handle);
    const request=submit(config.token);const form=await request.formData();form.set('audio',new Blob(['bad']));
    expect((await handle(new Request(request.url,{method:'POST',headers:{'X-Lab-Token':config.token,'X-Request-Id':'invalid-audio-123456789'},body:form}))).status).toBe(400); // 无效音频必须在付费请求前拒绝。
    expect(provider.submit).not.toHaveBeenCalled();
  });
});

describe('Prompt链路与安全重新准备回归',()=>{
  it.each(['success','upload-error','generation-error','query-error'])('Mock完整流程及错误阶段：%s',async(scenario)=>{
    const provider={submit:vi.fn(),result:vi.fn()};const handle=createLab({enabled:true,mode:'mock'},provider);const config=await connect(handle);
    const source=submit(config.token);const form=await source.formData();form.set('mockScenario',scenario);
    const response=await handle(new Request(source.url,{method:'POST',headers:{'X-Lab-Token':config.token,'X-Request-Id':'request-1234567890123456'},body:form}));
    const query=()=>handle(new Request('http://localhost:8787/api/audio-lab/jobs/request-1234567890123456',{headers:{'X-Lab-Token':config.token}}));
    if(scenario==='upload-error'){expect((await response.json()).stage).toBe('upload');}
    else{
      expect(response.status).toBe(202);const first=await query();
      if(scenario==='success'){expect(first.status).toBe(202);expect((await query()).status).toBe(200);}
      if(scenario==='generation-error')expect((await first.json()).stage).toBe('generation');
      if(scenario==='query-error'){expect((await first.json()).stage).toBe('query');expect((await query()).status).toBe(200);}
    }
    expect(provider.submit).not.toHaveBeenCalled();expect(provider.result).not.toHaveBeenCalled();
  });
  it('30秒参考直接构造90秒上游请求，参考字节不扩展且配置/后端均支持90',async()=>{
    const {createHash}=await import('node:crypto');let uploaded:FormData|undefined;
    const upstream=vi.fn(async(url:unknown,options?:RequestInit)=>{uploaded=await new Request(String(url),options).formData();return Response.json({id:'a'.repeat(64)},{status:202});});
    const handle=createLab({enabled:true,mode:'live',key:'fake'},new StableAudioProvider('fake',upstream as typeof fetch));const config=await connect(handle);
    expect(config.allowedDurations).toContain(90);expect(config.pricing).toMatchObject({credits:8,usd:.08});
    const form=await submit(config.token).formData();form.set('duration','90');
    const response=await handle(new Request('http://localhost:8787/api/audio-lab/jobs',{method:'POST',headers:{'X-Lab-Token':config.token,'X-Request-Id':'ninety-seconds-123456789'},body:form}));
    expect(response.status).toBe(202);expect(upstream).toHaveBeenCalledOnce();expect(uploaded!.get('duration')).toBe('90');
    const bytes=await(uploaded!.get('audio') as File).arrayBuffer();expect(bytes.byteLength).toBe(44+30*44100*4);
    const hash=(value:ArrayBuffer)=>createHash('sha256').update(Buffer.from(value)).digest('hex');expect(hash(bytes)).toBe(hash(await audio().arrayBuffer()));
  });
  it('Mock选择90秒仍只回传原30秒参考，不冒充真实90秒音乐',async()=>{
    const provider={submit:vi.fn(),result:vi.fn()};const handle=createLab({enabled:true,mode:'mock'},provider);const config=await connect(handle);
    const form=await submit(config.token).formData();form.set('duration','90');
    await handle(new Request('http://localhost:8787/api/audio-lab/jobs',{method:'POST',headers:{'X-Lab-Token':config.token,'X-Request-Id':'mock-ninety-123456789'},body:form}));
    const query=()=>handle(new Request('http://localhost:8787/api/audio-lab/jobs/mock-ninety-123456789',{headers:{'X-Lab-Token':config.token}}));
    expect((await query()).status).toBe(202);expect((await(await query()).blob()).size).toBe(audio().size);expect(provider.submit).not.toHaveBeenCalled();
  });
  it('前端输入→本地multipart→上游编码，Prompt和音频字节均完整',async()=>{
    const {submitAudio}=await import('../services/composition/audioLabClient');
    const {createHash}=await import('node:crypto');
    let uploaded:FormData|undefined;
    const upstream=vi.fn(async(url:unknown,options?:RequestInit)=>{uploaded=await new Request(String(url),options).formData();return Response.json({id:'a'.repeat(64)},{status:202});});
    const provider=new StableAudioProvider('test-private-key',upstream as typeof fetch);
    const handle=createLab({enabled:true,mode:'live',key:'test-private-key'},provider);const config=await connect(handle);
    vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>handle(new Request(`http://localhost:8787${url}`,options))));
    const prompt='  Instrumental only. Preserve the rhythm. Add a piano melody and evolving harmony.  ';
    await submitAudio(config,'full-chain-12345678901234',audio(),prompt,.6,true,undefined,30);
    expect(uploaded!.get('prompt')).toBe(prompt.trim());
    expect(uploaded!.get('strength')).toBe('0.6');expect(uploaded!.get('output_format')).toBe('mp3');
    const hash=(bytes:ArrayBuffer)=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
    expect(hash(await (uploaded!.get('audio') as File).arrayBuffer())).toBe(hash(await audio().arrayBuffer()));
    const logs=JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logs).toContain('promptPresent');expect(logs).toContain(String(prompt.trim().length));
    expect(logs).not.toContain('test-private-key');expect(logs).not.toContain(prompt.trim());
    expect(upstream).toHaveBeenCalledOnce();
  });
  it('提供者与前端拒绝空Prompt，上游fetch零调用',async()=>{
    const {submitAudio}=await import('../services/composition/audioLabClient');const fetcher=vi.fn();
    await expect(new StableAudioProvider('fake',fetcher).submit({audio:audio(),prompt:' \n ',strength:.6})).rejects.toThrow('Prompt必填');
    vi.stubGlobal('fetch',fetcher);
    await expect(submitAudio({mode:'live',token:'fake',duration:30,model:'stable-audio-3'},'invalid-prompt-12345678',audio(),' ',.6,true)).rejects.toThrow('Prompt必填');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('明确HTTP400拒绝后可手动重新准备，不重发；超时未知与pending不可解除',async()=>{
    const {ApiError}=await import('../../server/provider');
    const provider={submit:vi.fn(async()=>{throw new ApiError('bad_request · prompt: required',400,'upload','UPSTREAM_400');}),result:vi.fn()};
    const handle=createLab({enabled:true,mode:'live',key:'fake'},provider);const config=await connect(handle);
    await handle(submit(config.token));
    const reset=(id:string,acknowledgedRejected:boolean)=>new Request(`http://localhost:8787/api/audio-lab/jobs/${id}/prepare`,{method:'POST',headers:{'X-Lab-Token':config.token,'Content-Type':'application/json'},body:JSON.stringify({acknowledgedRejected})});
    expect((await handle(reset('request-1234567890123456',false))).status).toBe(400);
    const ready=await handle(reset('request-1234567890123456',true));expect(await ready.json()).toMatchObject({prepared:true,previousStateVerified:true});
    expect(provider.submit).toHaveBeenCalledOnce();
    provider.submit.mockRejectedValueOnce(new ApiError('timeout',502,'upload','SUBMISSION_UNCERTAIN',undefined,true));
    await handle(submit(config.token,'uncertain-request-123456'));
    expect((await handle(reset('uncertain-request-123456',true))).status).toBe(409);
    provider.submit.mockResolvedValueOnce({upstreamId:'b'.repeat(64)} as never);
    await handle(submit(config.token,'pending-request-123456789'));
    expect((await handle(reset('pending-request-123456789',true))).status).toBe(409);
    expect(provider.result).not.toHaveBeenCalled();
  });
  it('初始化状态查询只读本地记录，不查询上游，也不重新提交',async()=>{
    const provider={submit:vi.fn(async()=>({upstreamId:'a'.repeat(64)})),result:vi.fn()};const handle=createLab({enabled:true,mode:'live',key:'fake'},provider);const config=await connect(handle);
    const status=(id:string)=>handle(new Request(`http://localhost:8787/api/audio-lab/jobs/${id}/status`,{headers:{'X-Lab-Token':config.token}}));
    expect(await(await status('missing-request-123456789')).json()).toMatchObject({state:'unknown',canPrepare:false});
    await handle(submit(config.token));
    expect(await(await status('request-1234567890123456')).json()).toMatchObject({state:'pending',canPrepare:false});
    expect(provider.submit).toHaveBeenCalledOnce();expect(provider.result).not.toHaveBeenCalled();
  });
  it('服务重启丢失旧记录时不能仅凭勾选就解除未知锁',async()=>{
    const provider={submit:vi.fn(),result:vi.fn()};const handle=createLab({enabled:true,mode:'live',key:'fake'},provider);const config=await connect(handle);
    const request=(ack:boolean)=>new Request('http://localhost:8787/api/audio-lab/jobs/legacy-request-123456789/prepare',{method:'POST',headers:{'X-Lab-Token':config.token,'Content-Type':'application/json'},body:JSON.stringify({acknowledgedRejected:ack})});
    expect((await handle(request(false))).status).toBe(400);
    const response=await handle(request(true));expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:'JOB_STATE_UNKNOWN'});
    expect(provider.submit).not.toHaveBeenCalled();
  });
  it('带JUNK元数据的有效PCM WAV不会再被固定44字节校验误拒绝',async()=>{
    const source=new Uint8Array(await audio().arrayBuffer());const bytes=new Uint8Array(source.length+12);bytes.set(source.slice(0,36));
    bytes.set(new TextEncoder().encode('JUNK'),36);new DataView(bytes.buffer).setUint32(40,4,true);bytes.set([1,2,3,4],44);bytes.set(source.slice(36),48);new DataView(bytes.buffer).setUint32(4,bytes.length-8,true);
    await expect(validateReference(new Blob([bytes]))).resolves.toMatchObject({channels:2,duration:30});
  });
});

describe('提交不确定诊断和重启恢复（无网络）',()=>{
  it('本地超时保留来源与原因，绝不重试，也不泄露底层错误中的密钥',async()=>{
    const fetcher=vi.fn(async()=>{throw new DOMException('fake-secret','TimeoutError');});
    const provider=new StableAudioProvider('fake-secret',fetcher);
    try{await provider.submit({audio:audio(),prompt:'Instrumental',strength:.6,duration:90});throw Error('expected failure');}
    catch(error){expect(error).toMatchObject({code:'SUBMISSION_UNCERTAIN',submissionUnknown:true,diagnostic:{source:'local-transport',cause:'LOCAL_SUBMIT_TIMEOUT',timeoutMs:90000}});expect(JSON.stringify(error)).not.toContain('fake-secret');}
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('已收到上游502与本地连接异常明确区分，二者都不能安全重提',async()=>{
    const fetcher=vi.fn(async()=>Response.json({name:'gateway_error'},{status:502}));
    await expect(new StableAudioProvider('fake',fetcher).submit({audio:audio(),prompt:'p',strength:.6})).rejects.toMatchObject({code:'UPSTREAM_502',submissionUnknown:true,diagnostic:{source:'upstream-http',upstreamStatus:502}});
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('记录已接收任务ID，服务重启后仅GET恢复结果，不再POST',async()=>{
    let saved:unknown=[];const journal={read:()=>saved,write:(value:unknown)=>{saved=JSON.parse(JSON.stringify(value));}};
    const provider={submit:vi.fn(async()=>({upstreamId:'c'.repeat(64)})),result:vi.fn(async()=>new Blob(['music'],{type:'audio/mpeg'}))};
    const first=createLab({enabled:true,mode:'live',key:'fake',journal},provider);const config=await connect(first);
    expect((await first(submit(config.token))).status).toBe(202);
    expect(JSON.stringify(saved)).not.toContain('Instrumental');expect(JSON.stringify(saved)).not.toContain('fake');
    const second=createLab({enabled:true,mode:'live',key:'fake',journal},provider);const next=await connect(second);
    const status=await second(new Request('http://localhost:8787/api/audio-lab/jobs/request-1234567890123456/status',{headers:{'X-Lab-Token':next.token}}));
    expect(await status.json()).toMatchObject({upstreamId:'c'.repeat(64),outcome:'accepted',canPrepare:false});expect(provider.result).not.toHaveBeenCalled();
    const result=await second(new Request('http://localhost:8787/api/audio-lab/jobs/request-1234567890123456',{headers:{'X-Lab-Token':next.token}}));
    expect(result.status).toBe(200);expect(provider.submit).toHaveBeenCalledOnce();expect(provider.result).toHaveBeenCalledWith('c'.repeat(64));
  });
  it('提交期间重启保留未知锁，阻止换ID付费提交或手动解除',async()=>{
    const journal={read:()=>[{id:'request-1234567890123456',status:'submitting',duration:90}],write:vi.fn()};
    const provider={submit:vi.fn(),result:vi.fn()};const handle=createLab({enabled:true,mode:'live',key:'fake',journal},provider);const config=await connect(handle);
    expect((await handle(submit(config.token,'another-1234567890123456'))).status).toBe(409);
    const response=await handle(new Request('http://localhost:8787/api/audio-lab/jobs/request-1234567890123456/prepare',{method:'POST',headers:{'X-Lab-Token':config.token,'Content-Type':'application/json'},body:JSON.stringify({acknowledgedRejected:true})}));
    expect(response.status).toBe(409);expect(provider.submit).not.toHaveBeenCalled();expect(provider.result).not.toHaveBeenCalled();
  });
  it('诊断记录损坏时拒绝生成，绝不当作无历史任务',async()=>{
    const provider={submit:vi.fn(),result:vi.fn()};const handle=createLab({enabled:true,mode:'live',key:'fake',journal:{read:()=>{throw Error('corrupt');},write:vi.fn()}},provider);const config=await connect(handle);
    expect((await handle(submit(config.token))).status).toBe(409);expect(provider.submit).not.toHaveBeenCalled();
  });
});

describe('旧版丢失记录的人工审计恢复与完整持久化',()=>{
 const lost='11111111-1111-4111-8111-111111111111';
 const confirmation={typedId:lost,reason:'已核对账户和原始错误记录，没有找到可靠上游ID，理解状态未知及重复计费风险。',acknowledgedAccount:true,acknowledgedOriginalError:true,acknowledgedRisk:true};
 function journal(initial:unknown=[]){let saved=initial;return {read:()=>saved,write:vi.fn((value:unknown)=>{saved=JSON.parse(JSON.stringify(value));})};}
 function api(token:string,path:string,body?:unknown){return new Request(`http://localhost:8787/api/audio-lab/${path}`,{method:body?'POST':'GET',headers:{'X-Lab-Token':token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
 it('本地丢失返回未知和人工入口，不自动归档或查询任何上游',async()=>{
  const provider={submit:vi.fn(),result:vi.fn()},store=journal(),handle=createLab({enabled:true,mode:'live',key:'fake',journal:store},provider),config=await connect(handle);
  expect(await(await handle(api(config.token,`jobs/${lost}/status`))).json()).toMatchObject({state:'unknown',canPrepare:false,canManualRecover:true});
  expect((await handle(api(config.token,`jobs/${lost}`))).status).toBe(404);expect(store.write).not.toHaveBeenCalled();expect(provider.result).not.toHaveBeenCalled();expect(provider.submit).not.toHaveBeenCalled();
 });
 it('完整显式确认才保存审计，旧任务仍未知，重启保留且同ID永不重提',async()=>{
  const provider={submit:vi.fn(),result:vi.fn()},store=journal(),handle=createLab({enabled:true,mode:'live',key:'fake',journal:store},provider),config=await connect(handle);
  for(const change of [{acknowledgedRisk:false},{acknowledgedAccount:false},{acknowledgedOriginalError:false},{typedId:'wrong'},{reason:'余额未变'}])expect((await handle(api(config.token,`jobs/${lost}/manual-recovery`,{...confirmation,...change}))).status).toBe(400);
  expect(store.write).not.toHaveBeenCalled();
  expect(await(await handle(api(config.token,`jobs/${lost}/manual-recovery`,confirmation))).json()).toMatchObject({archived:true,outcome:'unknown'});
  const restarted=createLab({enabled:true,mode:'live',key:'fake',journal:store},provider),next=await connect(restarted);
  expect(await(await restarted(api(next.token,`jobs/${lost}/status`))).json()).toMatchObject({state:'unknown',manuallyArchived:true,canPrepare:false});
  const list=await(await restarted(api(next.token,'jobs'))).json();expect(list.records[0]).toMatchObject({id:lost,blocksSubmission:false,recovery:{reason:confirmation.reason,outcome:'unknown'}});
  expect((await restarted(submit(next.token,lost))).status).toBe(409);expect(provider.submit).not.toHaveBeenCalled();expect(provider.result).not.toHaveBeenCalled();
 });
 it('已有可靠提交或运行中任务不允许人工归档，也不会借旧任务恢复解除其他锁',async()=>{
  const other='other-task-12345678901234';const store=journal([{id:other,status:'pending',upstreamId:'d'.repeat(64),duration:90}]);
  const provider={submit:vi.fn(),result:vi.fn()},handle=createLab({enabled:true,mode:'live',key:'fake',journal:store},provider),config=await connect(handle);
  expect((await handle(api(config.token,`jobs/${other}/manual-recovery`,{...confirmation,typedId:other}))).status).toBe(409);
  expect((await handle(api(config.token,`jobs/${lost}/manual-recovery`,confirmation))).status).toBe(200);
  expect((await handle(submit(config.token))).status).toBe(409);expect(provider.submit).not.toHaveBeenCalled();expect(provider.result).not.toHaveBeenCalled();
 });
 it('审计写入失败不归档，不允许刷新后误认为已恢复',async()=>{
  const store={read:()=>[],write:()=>{throw Error('disk full');}},provider={submit:vi.fn(),result:vi.fn()},handle=createLab({enabled:true,mode:'live',key:'fake',journal:store},provider),config=await connect(handle);
  expect((await handle(api(config.token,`jobs/${lost}/manual-recovery`,confirmation))).status).toBe(503);
  expect(await(await handle(api(config.token,`jobs/${lost}/status`))).json()).toMatchObject({state:'unknown',canManualRecover:false});expect(provider.submit).not.toHaveBeenCalled();
 });
 it('完成状态、时间和上游ID持久化，重启不会变回pending或自动发出请求',async()=>{
  const provider={submit:vi.fn(async()=>({upstreamId:'e'.repeat(64)})),result:vi.fn(async()=>new Blob(['music'],{type:'audio/mpeg'}))},store=journal(),handle=createLab({enabled:true,mode:'live',key:'fake',journal:store},provider),config=await connect(handle);
  await handle(submit(config.token));expect((await handle(api(config.token,'jobs/request-1234567890123456'))).status).toBe(200);
  const entries=store.read() as {status:string;createdAt:string;updatedAt:string}[];expect(entries[0].status).toBe('complete');expect(entries[0].updatedAt).toBeTruthy();expect(entries[0].createdAt).toBeTruthy();
  const restarted=createLab({enabled:true,mode:'live',key:'fake',journal:store},provider),next=await connect(restarted);
  expect(await(await restarted(api(next.token,'jobs/request-1234567890123456/status'))).json()).toMatchObject({state:'complete',upstreamId:'e'.repeat(64)});
  expect(provider.result).toHaveBeenCalledOnce();expect(provider.submit).toHaveBeenCalledOnce();
 });
 it('查询错误持久化，不把查询失败当作生成失败',async()=>{
  const provider={submit:vi.fn(async()=>({upstreamId:'f'.repeat(64)})),result:vi.fn(async()=>{throw Error('network');})},store=journal(),handle=createLab({enabled:true,mode:'live',key:'fake',journal:store},provider),config=await connect(handle);
  await handle(submit(config.token));await handle(api(config.token,'jobs/request-1234567890123456'));
  expect((store.read() as {status:string;queryError:string}[])[0]).toMatchObject({status:'pending',queryError:'任务查询失败，不能据此判断生成失败'});expect(provider.submit).toHaveBeenCalledOnce();
 });
});
