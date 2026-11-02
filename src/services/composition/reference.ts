import type { RhythmEvent, SoundAsset } from '../../types/domain';
import { soundBytes } from '../sounds/resolve';
export type ReferenceEvent={soundId:string;time:number;gain:number};
export function referenceTimeline(rhythm:RhythmEvent[],ids:string[],duration=30):ReferenceEvent[]{
  if(!rhythm.length||!ids.length) throw new Error('请先录制节奏并选择至少一个声音');
  if(rhythm.length>2000||ids.length>16) throw new Error('本地测试最多支持2000次敲击和16个素材，请减少后重试');
  const ordered=[...rhythm].sort((a,b)=>a.time-b.time);
  if(ordered[0].time!==0||ordered.some(event=>!Number.isFinite(event.time)||event.time<0||!Number.isFinite(event.duration)||event.duration<0||!Number.isFinite(event.velocity)||event.velocity<0||event.velocity>1)) throw new Error('节奏数据无效');
  const gaps=ordered.slice(1).map((event,i)=>event.time-ordered[i].time).filter(gap=>gap>0).sort((a,b)=>a-b);
  const last=ordered.at(-1)!;
  const period=last.time+Math.max(last.duration,gaps[Math.floor(gaps.length/2)]??400,50);
  const events:ReferenceEvent[]=[];
  for(let offset=0;offset<duration*1000;offset+=period){
    for(const hit of ordered){if(offset+hit.time>=duration*1000)break;
      // 每个时间点使用全部选定素材，避免稀疏长节奏漏掉某个素材。
      for(const id of ids){if(events.length>=16000)throw new Error('节奏过密，请减少敲击或素材数量');events.push({soundId:id,time:(offset+hit.time)/1000,gain:hit.velocity/ids.length});}
    }
  }
  if(events.length>16000)throw new Error('节奏过密，请减少敲击或素材数量');
  return events;
}
/** 标准PCM16LE双声道；复制当前单声道混音到L/R，不改变节奏、平衡或峰值策略。 */
export function encodeWav(samples:Float32Array,rate=44100):Blob{
  const channels=2,blockAlign=channels*2;
  const buffer=new ArrayBuffer(44+samples.length*blockAlign),view=new DataView(buffer);
  const write=(offset:number,text:string)=>[...text].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
  write(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*blockAlign,true);view.setUint16(32,blockAlign,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*blockAlign,true);
  let peak=0;for(const value of samples)peak=Math.max(peak,Math.abs(value));const gain=peak>.85?.85/peak:1;
  samples.forEach((value,i)=>{
    const pcm=Math.round(Math.max(-1,Math.min(1,value*gain))*32767);
    view.setInt16(44+i*blockAlign,pcm,true);
    view.setInt16(44+i*blockAlign+2,pcm,true);
  });
  return new Blob([buffer],{type:'audio/wav'});
}
export async function renderReference(rhythm:RhythmEvent[],sounds:SoundAsset[],signal?:AbortSignal):Promise<Blob>{
  const timeline=referenceTimeline(rhythm,sounds.map(sound=>sound.id));
  if(!globalThis.OfflineAudioContext)throw new Error('浏览器不支持离线音频渲染，请使用新版Safari或Chrome');
  const context=new OfflineAudioContext(1,44100*30,44100);
  const compressor=context.createDynamicsCompressor();compressor.threshold.value=-12;compressor.ratio.value=6;compressor.connect(context.destination);
  const buffers=new Map<string,AudioBuffer>();
  for(const sound of sounds){signal?.throwIfAborted();buffers.set(sound.id,await context.decodeAudioData(await soundBytes(sound)));}
  for(const event of timeline){
    signal?.throwIfAborted();const source=context.createBufferSource();source.buffer=buffers.get(event.soundId)!;
    const gain=context.createGain();const end=Math.min(30,event.time+source.buffer.duration);
    const fade=Math.min(.008,(end-event.time)/3);
    gain.gain.setValueAtTime(0,event.time);gain.gain.linearRampToValueAtTime(event.gain,event.time+fade);
    gain.gain.setValueAtTime(event.gain,Math.max(event.time+fade,end-fade));gain.gain.linearRampToValueAtTime(0,end);
    source.connect(gain).connect(compressor);source.start(event.time);source.stop(end);
  }
  const rendered=await context.startRendering();signal?.throwIfAborted();
  return encodeWav(rendered.getChannelData(0));
}
