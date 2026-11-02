import {useEffect,useRef,useState} from 'react';
import type {MusicIntent} from '../services/composition/musicIntent';
import type {SoundAsset} from '../types/domain';
import type {Retention} from '../services/composition/prompt';
import {mixUserSounds} from '../services/composition/postMix';
import {inspectAudioQuality,type AudioQuality} from '../services/composition/quality';
import {ActionButton} from './Controls';
export function PostMixPanel({music,intent,sounds,enabled,intensity,duration}:{music?:Blob;intent:MusicIntent;sounds:SoundAsset[];enabled:boolean;intensity:Retention;duration:number}){
 const [blob,setBlob]=useState<Blob>(),[url,setUrl]=useState(''),[note,setNote]=useState(''),[working,setWorking]=useState(false),[revision,setRevision]=useState(0),[quality,setQuality]=useState<AudioQuality>();const audio=useRef<HTMLAudioElement>(null);
 useEffect(()=>{if(!blob){setUrl('');return;}const value=URL.createObjectURL(blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[blob]);
 useEffect(()=>{setBlob(undefined);setQuality(undefined);audio.current?.pause();if(!music||!enabled){setNote(enabled?'等待完整AI音频，未发起生成':'原始声音混入已关闭；保留AI原曲');setWorking(false);return;}
  const control=new AbortController();setWorking(true);setNote('正在本地混音，不调用AI');
  void mixUserSounds(music,intent,sounds,intensity,control.signal,duration).then(async result=>{const report=await inspectAudioQuality(result.blob,duration,control.signal);control.signal.throwIfAborted();setBlob(result.blob);setQuality(report);setNote(`${result.note} 安排${result.events.length}个短声音装饰。`);}).catch(error=>{if(!control.signal.aborted)setNote(`混音未完成：${error instanceof Error?error.message:'未知错误'}。AI原曲仍可下载，不自动重新生成。`);}).finally(()=>{if(!control.signal.aborted)setWorking(false);});
  return()=>control.abort();
 },[music,enabled,intensity,intent,sounds,duration,revision]);
 return <section className="panel lab-panel"><h2>最终作品与用户声音混音</h2><p role="status">{note}</p><p>没有可靠检测生成歌曲BPM，不宣称节拍严格对齐；只在段落附近稀疏放置短素材，不叠加整段30秒参考，也不填补AI曲目的静音。</p>
 {enabled&&music&&<ActionButton tone="surface" disabled={working} onClick={()=>setRevision(n=>n+1)}>重新应用混音设置（仅本地）</ActionButton>}
 {quality&&<p role={quality.warnings.length?'alert':'status'}>{quality.warnings.length?'混音技术检查不合格':'混音未发现所检查的技术异常'}：有效声音 {quality.activeSeconds.toFixed(1)}秒／{quality.duration.toFixed(1)}秒。{quality.warnings.join(' ')} 不代表音乐审美合格。</p>}
 {url&&<><audio ref={audio} controls src={url} aria-label="试听混入个人声音后的最终作品"/><a className="action mint" href={url} download="wanwu-final-mix.wav">下载最终混音 WAV</a></>}
 </section>;
}
