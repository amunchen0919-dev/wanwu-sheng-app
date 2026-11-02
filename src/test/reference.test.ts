// @vitest-environment node
import { afterEach,describe,expect,it,vi } from 'vitest';
import { referenceTimeline,encodeWav,renderReference } from '../services/composition/reference';
import { NINETY_SECOND_DIRECTION, buildAudioPrompt, buildSubmissionPrompt } from '../services/composition/prompt';
import { builtinSounds } from '../services/sounds/catalog';
const rhythm=[0,420,610,1200].map((time,i)=>({id:String(i),time,duration:40,velocity:.3+i*.15,source:'touch' as const}));
afterEach(()=>vi.unstubAllGlobals());
describe('参考音频与提示',()=>{
  it('保留非均匀原始间隔、重音、循环停顿，并使用全部选择的素材',()=>{
    const events=referenceTimeline(rhythm,['a','b']);
    expect(events.slice(0,8).map(event=>event.time)).toEqual([0,0,.42,.42,.61,.61,1.2,1.2]);
    expect(events[0].gain).toBe(.15);expect(events[6].gain).toBeCloseTo(.375);expect(events[8].time).toBe(1.62);
    expect(new Set(events.map(event=>event.soundId))).toEqual(new Set(['a','b']));
    expect(Math.max(...events.map(event=>event.time))).toBeLessThan(30);
  });
  it('WAV精确30秒，峰值受控，缺失/过密输入拒绝',async()=>{
    const wav=encodeWav(new Float32Array(44100*30).fill(2));const bytes=await wav.arrayBuffer();const view=new DataView(bytes);
    expect(view.getUint32(24,true)).toBe(44100);expect((bytes.byteLength-44)/176400).toBe(30);expect(view.getInt16(44,true)).toBeLessThan(28000);
    expect(()=>referenceTimeline([],['a'])).toThrow();expect(()=>referenceTimeline(rhythm,[])).toThrow();
    expect(()=>referenceTimeline(Array.from({length:2000},(_,i)=>({...rhythm[0],id:String(i)})),['a'])).toThrow('过密');
  });
  it('默认导出标准PCM16LE立体声，左右采样相等、音量关系不变',async()=>{
    const samples=new Float32Array([0,.1,-.2,.4,-.5]);
    const bytes=await encodeWav(samples).arrayBuffer(),view=new DataView(bytes);
    expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('RIFF');
    expect(view.getUint32(4,true)).toBe(bytes.byteLength-8);
    expect(view.getUint16(20,true)).toBe(1);expect(view.getUint16(22,true)).toBe(2);
    expect(view.getUint32(24,true)).toBe(44100);expect(view.getUint32(28,true)).toBe(176400);
    expect(view.getUint16(32,true)).toBe(4);expect(view.getUint16(34,true)).toBe(16);
    expect(view.getUint32(40,true)).toBe(samples.length*4);
    samples.forEach((sample,i)=>{
      expect(view.getInt16(44+i*4,true)).toBe(Math.round(sample*32767));
      expect(view.getInt16(46+i*4,true)).toBe(view.getInt16(44+i*4,true));
    });
  });
  it('中文规则转英文，个人录音不臆测内容，未匹配明确返回0',()=>{
    const result=buildAudioPrompt('安静的感觉，雨声更明显',[builtinSounds[2],{...builtinSounds[0],id:'recording',source:'recording'}]);
    expect(result.prompt).toContain('calm');expect(result.prompt).toContain('rain texture forward');expect(result.prompt).toContain('user-recorded texture');
    expect(result.prompt).toContain('No vocals.');expect(result.prompt).toContain('creative inspiration');expect(result.matched).toBe(2);
    expect(buildAudioPrompt('未经识别描述',[]).matched).toBe(0);
  });
  it('渲染器解码选中素材并按原节奏调度，再导出真实WAV结构',async()=>{
    const sources:{buffer:unknown;start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>}[]=[];
    const param=()=>({setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()});
    const decode=vi.fn(async()=>({duration:.2}));
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(10)})));
    vi.stubGlobal('OfflineAudioContext',class{
      destination={}; decodeAudioData=decode;
      createDynamicsCompressor(){return{threshold:{value:0},ratio:{value:0},connect:vi.fn()};}
      createGain(){return{gain:param(),connect:vi.fn()};}
      createBufferSource(){const source={buffer:null,start:vi.fn(),stop:vi.fn(),connect:vi.fn((gain)=>gain)};sources.push(source);return source;}
      async startRendering(){return{getChannelData:()=>new Float32Array(44100*30).fill(.2)};}
    });
    const output=await renderReference(rhythm,builtinSounds.slice(0,2));
    expect(decode).toHaveBeenCalledTimes(2);expect(sources.slice(0,4).map(source=>source.start.mock.calls[0][0])).toEqual([0,0,.42,.42]);
    expect(output.size).toBe(44+30*44100*4);expect(sources.every(source=>!!source.buffer)).toBe(true);
  });
  it('90秒默认优先完整歌曲，三种保留程度影响Prompt，保留自定义文本',()=>{
    const full=buildSubmissionPrompt(NINETY_SECOND_DIRECTION,90);
    for(const phrase of ['beautiful, complete','memorable and singable','rich chord progressions','contrasting sections','emotional climax','satisfying ending','Avoid long silent passages','No vocals','Reference influence: low'])expect(full).toContain(phrase);
    expect(full).not.toContain('recognizable throughout');
    expect(buildSubmissionPrompt('My custom direction',90,'medium')).toContain('My custom direction');
    expect(buildSubmissionPrompt('p',90,'medium')).toContain('Moderately retain');
    expect(buildSubmissionPrompt(NINETY_SECOND_DIRECTION,90,'high')).toContain('as recognizable as possible');
    expect(buildSubmissionPrompt(NINETY_SECOND_DIRECTION,90,'high')).not.toContain('Retain only the approximate');
    expect(buildSubmissionPrompt('p',30)).toContain('Target duration: 30');
  });
  it('不支持离线音频时报告错误，不假装生成',async()=>{
    vi.stubGlobal('OfflineAudioContext',undefined);await expect(renderReference(rhythm,[builtinSounds[0]])).rejects.toThrow('不支持离线');
  });
});
