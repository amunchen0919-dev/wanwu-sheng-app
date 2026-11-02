import type {MusicIntent} from './musicIntent';
import type {SoundAsset} from '../../types/domain';
import type {Retention} from './prompt';
import {soundBytes} from '../sounds/resolve';
import {analyzeAudio} from './quality';
export type MixEvent={soundId:string;time:number;gain:number;pan:number;maxDuration:number};
/** 未可靠检测生成音乐拍点：仅在段落附近放置稀疏装饰，绝不声称与真实节拍对齐。 */
export function planPostMix(intent:MusicIntent,duration:number,intensity:Retention):MixEvent[]{
 const count={low:3,medium:5,high:7}[intensity],gain={low:.045,medium:.07,high:.1}[intensity];
 if(!intent.events.length||!intent.sounds.length||duration<15)return[];
 const accents=[...intent.events].sort((a,b)=>b.velocity-a.velocity).slice(0,3);
 const signatures=[...intent.sounds].sort((a,b)=>Number(b.source==='recording')-Number(a.source==='recording'));
 const groups=intensity==='low'?[1,1,1]:intensity==='medium'?[1,2,2]:[2,2,3];
 const rawIntervals=intent.motifs[0]?.intervalsMs??intent.events.slice(1,3).map((e,i)=>e.time-intent.events[i].time);
 const intervals=rawIntervals.map(ms=>Math.max(.08,Math.min(.8,ms/1000)));const result:MixEvent[]=[];
 for(let group=0;group<groups.length;group++){let offset=0;for(let hit=0;hit<groups[group];hit++){
  const i=result.length;if(hit)offset+=intervals[(hit-1)%Math.max(1,intervals.length)]??.3;
  result.push({soundId:signatures[i%signatures.length].id,time:duration*(.18+group*.3)+offset,gain:gain*(.5+.5*accents[i%accents.length].velocity),pan:i%2?.25:-.25,maxDuration:1.2});
 }}
 return result.slice(0,count);
}
/** 保持双声道与完整时长，整体统一缩放限峰，不改变声道平衡。 */
export function encodeStereoWav(channels:Float32Array[],rate:number):Blob{
 const length=channels[0].length,bytes=new ArrayBuffer(44+length*4),v=new DataView(bytes);const text=(o:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 text(0,'RIFF');text(8,'WAVE');text(12,'fmt ');text(36,'data');v.setUint32(4,bytes.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);v.setUint32(40,length*4,true);
 let peak=0;for(const c of channels)for(const value of c)peak=Math.max(peak,Math.abs(value));const gain=peak>.95?.95/peak:1;
 for(let i=0;i<length;i++)for(let c=0;c<2;c++)v.setInt16(44+i*4+c*2,Math.round(Math.max(-1,Math.min(1,channels[c%channels.length][i]*gain))*32767),true);
 return new Blob([bytes],{type:'audio/wav'});
}
export type PcmSound={channels:Float32Array[];sampleRate:number};
/** 纯DSP，便于在Mock端到端测试中验证真正的混音字节；不假设AI曲目的拍点。 */
export function mixPcm(song:PcmSound,assets:Map<string,PcmSound>,events:MixEvent[]):Float32Array[]{
 const length=song.channels[0].length,rate=song.sampleRate;
 const output=[0,1].map(c=>Float32Array.from(song.channels[c%song.channels.length],v=>v*.9));
 for(const event of events){const asset=assets.get(event.soundId);if(!asset)throw Error('混音素材缺失');
  let offset=0;for(let i=0;i<asset.channels[0].length;i++){if(asset.channels.some(c=>Math.abs(c[i])>.003)){offset=i;break;}}
  const count=Math.min(Math.floor(event.maxDuration*rate),Math.floor((asset.channels[0].length-offset)*rate/asset.sampleRate),length-Math.floor(event.time*rate));
  const start=Math.floor(event.time*rate),delay=Math.round(.07*rate),alpha=(1/(2*Math.PI*180))/(1/(2*Math.PI*180)+1/rate);let previous=0,filtered=0;
  for(let i=0;i<count;i++){const position=offset+i*asset.sampleRate/rate,index=Math.floor(position),fraction=position-index;
   let value=0;for(const c of asset.channels)value+=(c[index]??0)*(1-fraction)+(c[index+1]??0)*fraction;value/=asset.channels.length;
   filtered=alpha*(filtered+value-previous);previous=value;
   const envelope=Math.max(0,Math.min(1,i/(.015*rate),(count-i)/(.25*rate))),sample=filtered*event.gain*envelope;
   const pan=Math.max(-1,Math.min(1,event.pan)),gains=[Math.cos((pan+1)*Math.PI/4),Math.sin((pan+1)*Math.PI/4)];
   for(let c=0;c<2;c++){output[c][start+i]+=sample*gains[c];if(start+i+delay<length)output[c][start+i+delay]+=sample*gains[c]*.1;}
  }
 }
 return output;
}
export async function mixUserSounds(music:Blob,intent:MusicIntent,sounds:SoundAsset[],intensity:Retention,signal?:AbortSignal,expectedDuration=90):Promise<{blob:Blob;events:MixEvent[];note:string}>{
 if(!globalThis.AudioContext)throw Error('浏览器不支持音频解码混音；原AI音频仍可下载');
 const context=new AudioContext();
 try{
  const song=await context.decodeAudioData(await music.arrayBuffer());signal?.throwIfAborted();
  const channels=Array.from({length:song.numberOfChannels},(_,i)=>song.getChannelData(i));
  const quality=analyzeAudio(channels,song.sampleRate,expectedDuration);
  if(Math.abs(quality.duration-expectedDuration)>2||quality.activeSeconds<quality.duration*.85||quality.longestSilence>=10||(quality.rmsDb??-Infinity)<-45)throw Error('原AI音乐存在时长或声音覆盖异常，停止混入；不能用用户声音填补静音或伪装完整作品');
  // 完整曲目仅有峰值告警时，可给混音留余量；不覆盖原文件，也不声称修复既有削波失真。
  const peak=Math.max(...channels.map(channel=>{let value=0;for(const sample of channel)value=Math.max(value,Math.abs(sample));return value;}));
  const headroom=peak>.85?.85/peak:1;
  const prepared=channels.map(channel=>Float32Array.from(channel,value=>value*headroom));
  const plan=planPostMix(intent,song.duration,intensity);if(!plan.length)throw Error('没有可用于混音的节奏或素材');
  const buffers=new Map<string,PcmSound>();
  for(const event of plan){signal?.throwIfAborted();if(buffers.has(event.soundId))continue;
   const asset=sounds.find(s=>s.id===event.soundId);if(!asset)throw Error('混音素材缺失');
   const decoded=await context.decodeAudioData(await soundBytes(asset));buffers.set(asset.id,{sampleRate:decoded.sampleRate,channels:Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i))});
  }
  const output=mixPcm({channels:prepared,sampleRate:song.sampleRate},buffers,plan);signal?.throwIfAborted();
  const report=analyzeAudio(output,song.sampleRate,expectedDuration);if(report.warnings.length)throw Error('混音后技术质量检查失败；请保留原曲，不自动重新生成');
  return{blob:encodeStereoWav(output,song.sampleRate),events:plan,note:`未检测歌曲真实BPM/强拍；按段落位置稀疏放置短素材，低音量、包络、高通均衡、轻微声像与短延迟空间效果。未整段叠加参考音频。${quality.warnings.length?'原曲存在峰值告警，混音仅降低整体音量留出余量，不修复既有失真；请对比试听原曲。':''}`};
 }finally{await context.close();}
}
