// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {extractMusicIntent} from '../services/composition/musicIntent';
import {buildIntentPrompt} from '../services/composition/intentPrompt';
import {analyzeAudio} from '../services/composition/quality';
import {encodeStereoWav,mixPcm,planPostMix,mixUserSounds} from '../services/composition/postMix';
import {builtinSounds} from '../services/sounds/catalog';
import {StableAudioProvider} from '../../server/provider';
import {createLab} from '../../server/app';
import {getLabConfig,submitAudio,fetchAudioResult} from '../services/composition/audioLabClient';
const rhythm=[0,500,1000,1500,2000,2500,3000].map((time,i)=>({id:String(i),time,duration:30,velocity:.4+i*.05,source:'mouse' as const}));
const intent=()=>extractMusicIntent(rhythm,builtinSounds.slice(0,2),'安静的钢琴');
function decodePcm(blob:Blob){return blob.arrayBuffer().then(bytes=>{const v=new DataView(bytes),channels=v.getUint16(22,true),rate=v.getUint32(24,true),length=v.getUint32(40,true)/(channels*2);return{sampleRate:rate,channels:Array.from({length:channels},(_,c)=>Float32Array.from({length},(_,i)=>v.getInt16(44+(i*channels+c)*2,true)/32768))};});}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('MusicIntent、Text-to-Audio与真实PCM混音的免费流水线',()=>{
 it('事件优先、BPM歧义和重复动机明确保留，不臆测个人声音内容',()=>{
  const result=intent();expect(result.tempo.candidates).toEqual([60,120,240]);expect(result.tempo.estimate).toBe(120);expect(result.tempo.confidence).toBe('medium');expect(result.motifs[0].occurrences).toBeGreaterThan(1);expect(result.events.map(e=>e.time)).toEqual(rhythm.map(e=>e.time));expect(result.sounds[0].triggerTimesMs).toEqual(rhythm.map(e=>e.time));
  expect(extractMusicIntent(rhythm.slice(0,2),[]).tempo.estimate).toBeUndefined();expect(extractMusicIntent([],[]).tempo.confidence).toBe('insufficient');
  expect(()=>extractMusicIntent([{...rhythm[0],time:NaN}],[])).toThrow();
 });
 it('独立完整歌曲Prompt包含风格、旋律、和声和曲式，不假装上传参考录音',()=>{
  const prompt=buildIntentPrompt(intent());for(const part of ['90-second','120 BPM','0–15','15–35','35–55','55–75','75–90','chord progressions','climax','No reference audio is attached','calm'])expect(prompt).toContain(part);
  const personal=extractMusicIntent(rhythm,[{...builtinSounds[0],id:'my-rec',name:'我的录音',source:'recording'}]);expect(buildIntentPrompt(personal)).toContain('content is unidentified');expect(prompt).not.toContain('Preserve the distinctive rhythmic pattern');
 });
 it('官方TTA实际编码只包含合法文本字段，不包含音频和strength，异步202仅一次POST',async()=>{
  vi.spyOn(console,'info').mockImplementation(()=>{});
  const fetcher=vi.fn<typeof fetch>(async()=>Response.json({id:'a'.repeat(64)},{status:202}));
  await new StableAudioProvider('fake',fetcher).submit({generationMode:'text-to-audio',prompt:buildIntentPrompt(intent()),strength:.6,duration:90});
  expect(fetcher).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0][0]).toBe('https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio');
  const form=await new Request(fetcher.mock.calls[0][0],fetcher.mock.calls[0][1]).formData();expect([...form.keys()].sort()).toEqual(['duration','model','output_format','prompt']);expect(form.get('model')).toBe('stable-audio-3');expect(form.get('duration')).toBe('90');expect(form.get('prompt')).toContain('main melody');
 });
 it('Mock端到端：事件→Prompt→前端请求→真实本地handler→90秒PCM→混入素材→质量检查，无上游网络',async()=>{
  vi.spyOn(console,'info').mockImplementation(()=>{});const provider={submit:vi.fn(),result:vi.fn()},handle=createLab({enabled:true,mode:'mock'},provider);
  const fetcher=vi.fn((url:string|URL|Request,options?:RequestInit)=>handle(new Request(new URL(String(url),'http://localhost:8787'),options)));vi.stubGlobal('fetch',fetcher);
  const config=await getLabConfig();const prompt=buildIntentPrompt(intent());await submitAudio(config,'pipeline-free-123456789',undefined,prompt,.6,false,undefined,90,'success','text-to-audio');
  expect(await fetchAudioResult(config,'pipeline-free-123456789')).toBeUndefined();const blob=await fetchAudioResult(config,'pipeline-free-123456789');expect(blob).toBeDefined();const song=await decodePcm(blob!);
  expect(analyzeAudio(song.channels,song.sampleRate,90)).toMatchObject({duration:90,passed:true});
  const plan=planPostMix(intent(),90,'low'),sample=Float32Array.from({length:16000},(_,i)=>Math.sin(i*.2)*Math.exp(-i/1600)*.5),assets=new Map(intent().sounds.map(s=>[s.id,{sampleRate:16000,channels:[sample]}]));
  const mixed=mixPcm(song,assets,plan),output=await decodePcm(encodeStereoWav(mixed,song.sampleRate));expect(output.channels).toHaveLength(2);expect(output.channels[0].length).toBe(song.channels[0].length);expect(analyzeAudio(output.channels,output.sampleRate,90).passed).toBe(true);
  const index=Math.round(plan[0].time*song.sampleRate)+100;expect(mixed[0][index]).not.toBeCloseTo(song.channels[0][index]*.9,7);expect(mixed[0][0]).toBeCloseTo(song.channels[0][0]*.9);
  expect(provider.submit).not.toHaveBeenCalled();expect(provider.result).not.toHaveBeenCalled();expect(fetcher.mock.calls.every(([url])=>String(url).startsWith('/api/audio-lab'))).toBe(true);
 });
 it('保守装饰不假装拍点对齐，不整段叠加；强度改变稀疏度，保留完整尾部',()=>{
  const low=planPostMix(intent(),90,'low'),high=planPostMix(intent(),90,'high');expect(low).toHaveLength(3);expect(high).toHaveLength(7);expect(high.every(e=>e.time>10&&e.time+e.maxDuration<84&&e.maxDuration<=1.2)).toBe(true);expect(high[0].gain).toBeGreaterThan(low[0].gain);
  const left=new Float32Array(100).fill(.2),right=new Float32Array(100).fill(-.1);return decodePcm(encodeStereoWav([left,right],100)).then(wav=>{expect(wav.channels[0][0]).toBeCloseTo(.2,3);expect(wav.channels[1][0]).toBeCloseTo(-.1,3);});
 });
 it('90秒仅30秒有声、不正常音量和削波均不合格，不能自动重新生成',()=>{
  const silent=new Float32Array(9000);silent.fill(.1,0,3000);expect(analyzeAudio([silent],100,90).passed).toBe(false);
  const loud=analyzeAudio([new Float32Array(9000).fill(1)],100,90);expect(loud.passed).toBe(false);expect(loud.clippedSampleRatio).toBe(1);
 });
 it('坏原曲拒绝混音，不用用户声音填补静音；解码上下文正确关闭',async()=>{
  const close=vi.fn(async()=>{});vi.stubGlobal('AudioContext',class{close=close;decodeAudioData=async()=>({numberOfChannels:1,sampleRate:100,duration:90,getChannelData:()=>new Float32Array(9000)});});
  await expect(mixUserSounds(new Blob(['bad']),intent(),builtinSounds.slice(0,2),'high')).rejects.toThrow('不能用用户声音填补静音');expect(close).toHaveBeenCalledOnce();
 });
});

it('新模式先验证费用确认与禁止音频上传，未知提交锁仍持久阻止重复POST',async()=>{
 vi.spyOn(console,'info').mockImplementation(()=>{});let saved:unknown=[];const journal={read:()=>saved,write:(value:unknown)=>{saved=JSON.parse(JSON.stringify(value));}};
 const provider={submit:vi.fn(async()=>{throw Error('connection');}),result:vi.fn()},handle=createLab({enabled:true,mode:'live',key:'fake',journal},provider);
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>handle(new Request(new URL(url,'http://localhost:8787'),options)));
 const config=await getLabConfig();await expect(submitAudio(config,'text-no-fee-123456789',undefined,'Music',.6,false,undefined,90,'success','text-to-audio')).rejects.toThrow('明确确认');expect(provider.submit).not.toHaveBeenCalled();
 const form=new FormData();form.set('generationMode','text-to-audio');form.set('audio',new Blob(['not-uploaded']));
 const invalid=await handle(new Request('http://localhost:8787/api/audio-lab/jobs',{method:'POST',headers:{'X-Lab-Token':config.token,'X-Request-Id':'no-audio-1234567890123'},body:form}));expect(invalid.status).toBe(400);expect(provider.submit).not.toHaveBeenCalled();
 await expect(submitAudio(config,'text-uncertain-123456789',undefined,'Music',.6,true,undefined,90,'success','text-to-audio')).rejects.toThrow('状态未知');
 expect((saved as {generationMode:string;duration:number}[])[0]).toMatchObject({generationMode:'text-to-audio',duration:90});
 await expect(submitAudio(config,'text-other-123456789',undefined,'Music',.6,true,undefined,90,'success','text-to-audio')).rejects.toThrow('已有任务');expect(provider.submit).toHaveBeenCalledOnce();expect(provider.result).not.toHaveBeenCalled();
});

it('Mock新路线完成状态与模式重启后恢复；只由显式GET重新取得同一测试音频',async()=>{
 vi.spyOn(console,'info').mockImplementation(()=>{});let saved:unknown=[];const journal={read:()=>saved,write:(value:unknown)=>{saved=JSON.parse(JSON.stringify(value));}};
 const provider={submit:vi.fn(),result:vi.fn()};let handle=createLab({enabled:true,mode:'mock',journal},provider);
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>handle(new Request(new URL(url,'http://localhost:8787'),options)));
 let config=await getLabConfig();await submitAudio(config,'mock-restore-123456789',undefined,'Music',.6,false,undefined,90,'success','text-to-audio');await fetchAudioResult(config,'mock-restore-123456789');const first=await fetchAudioResult(config,'mock-restore-123456789');
 handle=createLab({enabled:true,mode:'mock',journal},provider);config=await getLabConfig();const second=await fetchAudioResult(config,'mock-restore-123456789');expect(Buffer.from(await first!.arrayBuffer()).equals(Buffer.from(await second!.arrayBuffer()))).toBe(true);expect(provider.submit).not.toHaveBeenCalled();expect(provider.result).not.toHaveBeenCalled();
});

it('完整曲目仅峰值告警可留余量混音，但保留原曲告警且不冒称修复失真',async()=>{
 const song=Float32Array.from({length:9000},(_,i)=>Math.sin(i*.1)*1.1),before=song.slice();let decodes=0;const close=vi.fn(async()=>{});
 vi.stubGlobal('AudioContext',class{close=close;decodeAudioData=async()=>{const samples=decodes++===0?song:Float32Array.from({length:100},(_,i)=>Math.sin(i)*.2);return{numberOfChannels:1,sampleRate:100,duration:samples.length/100,getChannelData:()=>samples};};});
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(new Uint8Array([1,2,3])));vi.stubGlobal('fetch',fetcher);
 expect(analyzeAudio([song],100,90).passed).toBe(false);const result=await mixUserSounds(new Blob(['original']),intent(),builtinSounds.slice(0,2),'low');const decoded=await decodePcm(result.blob);
 expect(analyzeAudio(decoded.channels,decoded.sampleRate,90).passed).toBe(true);expect(result.note).toContain('不修复既有失真');expect(song).toEqual(before);expect(close).toHaveBeenCalledOnce();expect(fetcher.mock.calls.every(([url])=>String(url).startsWith('/assets/sounds/'))).toBe(true);
});
