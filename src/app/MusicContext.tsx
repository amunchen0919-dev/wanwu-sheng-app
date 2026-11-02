import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {mockMusic} from '../../server/mockMusic';
import {buildIntentPrompt} from '../services/composition/intentPrompt';
import {extractMusicIntent} from '../services/composition/musicIntent';
import {inspectAudioQuality} from '../services/composition/quality';
import {getLabConfig,getJobRegistry,getLocalTaskStatus,submitAudio,fetchAudioResult,prepareRejectedTest,formatLabError,type LabConfig,type LocalJobRecord} from '../services/composition/audioLabClient';
import {readFormalTask,writeFormalTask,type FormalTask} from '../services/composition/formalTask';
import {musicRepository,type MusicWork} from '../services/storage/music';
import type {CreationDraft,SoundAsset} from '../types/domain';
const Context=createContext<ReturnType<typeof useMusicState>|null>(null);
function useMusicState(){
 const [task,setTask]=useState(readFormalTask),[work,setWork]=useState<MusicWork>(),[config,setConfig]=useState<LabConfig>(),[registry,setRegistry]=useState<LocalJobRecord[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const current=useRef(task),guard=useRef(false),controller=useRef<AbortController|null>(null);current.current=task;
 function remember(next:FormalTask|undefined,required=false){try{writeFormalTask(next);}catch(e){if(required||!next)throw Error('任务记录保存失败，未提交新的生成；请检查本地存储空间或隐私设置');setError('任务状态无法同步到本机，请保留当前页面并下载结果；不要重新提交生成');}current.current=next;setTask(next);}
 useEffect(()=>{let active=true;if(task)void musicRepository.get(task.id).then(record=>{if(active&&record)setWork(record);}).catch(()=>{if(active)setError('无法读取已缓存作品，请检查本地存储；任务锁保留。');});return()=>{active=false;controller.current?.abort();};},[]);
 async function connect(){setError('');try{const c=await getLabConfig();setConfig(c);const list=await getJobRegistry(c);setRegistry(list.records);if(!list.journalHealthy)throw Error('服务任务记录不可用，暂时不能提交生成');return c;}catch(e){setError(formatLabError(e,'setup'));return undefined;}}
 async function cacheResult(blob:Blob,t:FormalTask){
  const record:MusicWork={id:t.id,title:t.source==='mock'?'免费体验作品（模拟）':t.intent?'我的AI音乐':'恢复的AI作品',source:t.source,createdAt:t.createdAt,updatedAt:Date.now(),duration:t.duration,intent:t.intent,prompt:t.prompt,blob,saved:false};
  setWork(record);remember({...t,status:'complete',error:undefined});setNotice('音频已返回，正在检查声音覆盖与时长；不代表音乐质量合格');
  try{const old=await musicRepository.get(t.id);await musicRepository.put({...record,saved:old?.saved??false});}catch{setError('音频已返回，但本地缓存失败；请立即下载保留，刷新后可能需要仅查询恢复。');}
  try{const quality=await inspectAudioQuality(blob,t.duration);const checked={...record,quality};if(current.current?.id===t.id){setWork(previous=>previous?.id===checked.id?{...previous,quality}:previous);setNotice(quality.warnings.length?'音频技术检查不合格，请试听核查；不会自动重新生成':'未发现所检查的技术异常，音乐性仍需试听确认');}
   const old=await musicRepository.get(t.id);await musicRepository.put({...checked,saved:old?.saved??false,mixBlob:old?.mixBlob,mixQuality:old?.mixQuality,mixNote:old?.mixNote,preferredMix:old?.preferredMix});
  }catch(e){if(current.current?.id===t.id)setNotice(`音频质量检查未完成：${e instanceof Error?e.message:'解码失败'}；可下载人工检查。`);}
 }
 async function poll(c:LabConfig,t:FormalTask,signal:AbortSignal){
  for(let i=0;i<60;i++){const blob=await fetchAudioResult(c,t.id,signal);signal.throwIfAborted();if(blob){await cacheResult(blob,t);return;}remember({...t,status:'pending'});setNotice('正在创作完整音乐，请稍候；等待不会重复提交');await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('查询已停止','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},10000);signal.addEventListener('abort',abort,{once:true});});}
  throw Error('本轮查询已到上限，状态仍需核实。请仅查询已有任务，不要重新提交');
 }
 function markUnknown(e:unknown){const active=current.current;if(active)remember({...active,status:'unknown',error:formatLabError(e,'upload')});}
 async function start(draft:CreationDraft,sounds:SoundAsset[],sessionId:string,localMock:boolean,confirmed:boolean,expectedMode?:'mock'|'live',expectedInstance?:string,expectedCredits=8){
  if(guard.current||current.current)return false;
  const selected=sounds.filter(s=>draft.selectedSoundIds.includes(s.id));
  if(!draft.rhythm.length||!selected.length||selected.length!==draft.selectedSoundIds.length){setError('请先录制节奏并选择完整可用的声音素材');return false;}
  guard.current=true;setBusy(true);setError('');const control=new AbortController();controller.current=control;
  try{const intent=extractMusicIntent(draft.rhythm,selected,draft.preferenceText),prompt=buildIntentPrompt(intent,90);if(!prompt.trim()||prompt.length>10000)throw Error('音乐偏好过长，请缩短后再试；未提交生成');let c:LabConfig|undefined;
   if(!localMock){c=await getLabConfig(control.signal);setConfig(c);if(expectedInstance&&c.runtime?.instanceId!==expectedInstance)throw Error('音乐服务已重启，请重新核对费用并确认');if(c.mode==='live'&&(c.pricing?.credits??8)!==expectedCredits)throw Error('预计费用已变化，请重新确认');if(c.mode!==expectedMode)throw Error('服务模式已变化，请重新核对费用并确认');if(!c.generationModes?.includes('text-to-audio'))throw Error('请重启支持完整音乐创作的服务');if(c.mode==='live'&&!confirmed)throw Error('请先明确确认本次预计8credits费用');const list=await getJobRegistry(c,control.signal);setRegistry(list.records);if(!list.journalHealthy||list.records.some(r=>r.blocksSubmission))throw Error('服务中还有未核实的任务，请先在我的音乐中查询已有任务');}
   const t:FormalTask={id:crypto.randomUUID(),sessionId,createdAt:Date.now(),source:localMock?'mock':c!.mode,localMock,status:'submitting',duration:90,intent,prompt};remember(t,true);setWork(undefined);
   if(localMock){await cacheResult(mockMusic(90),t);return true;}
   await submitAudio(c!,t.id,undefined,prompt,.6,confirmed,control.signal,90,'success','text-to-audio');remember({...t,status:'pending'});await poll(c!,t,control.signal);return true;
  }catch(e){if(!control.signal.aborted){setError(formatLabError(e,'upload'));markUnknown(e);}return false;}
  finally{guard.current=false;setBusy(false);}
 }
 async function query(){
  const t=current.current;if(!t||guard.current)return;guard.current=true;setBusy(true);setError('');const control=new AbortController();controller.current=control;
  try{let cached:MusicWork|undefined;try{cached=await musicRepository.get(t.id);}catch{setNotice('本地缓存暂不可用，将仅查询已有任务；返回后请下载保留');}if(cached){setWork(cached);remember({...t,status:'complete'});return;}
   if(t.localMock){await cacheResult(mockMusic(t.duration),t);return;}
   const c=await getLabConfig(control.signal);setConfig(c);const status=await getLocalTaskStatus(c,t.id,control.signal);
   if(status.requiresModeSwitch)throw Error('找到历史任务，请切回对应服务模式和账户再查询');
   if(status.canPrepare){remember({...t,status:'rejected',error:status.error});setNotice('服务已核实请求被拒绝，可显式重新准备，不自动生成');return;}
   const restored={...t,source:status.executionMode??t.source,duration:status.duration??t.duration};await poll(c,restored,control.signal);
  }catch(e){if(!control.signal.aborted){setError(formatLabError(e,'query'));remember({...t,status:'unknown',error:formatLabError(e,'query')});}}
  finally{guard.current=false;setBusy(false);}
 }
 async function recover(record:LocalJobRecord){if(current.current){setError('当前创作任务尚未关闭，请先查看或查询当前任务');return false;}remember({id:record.id,source:record.executionMode??config?.mode??'live',sessionId:'recovered',localMock:false,status:'unknown',createdAt:record.createdAt?Date.parse(record.createdAt):Date.now(),duration:record.duration??90});await query();return true;}
 async function prepareAgain(){const t=current.current;if(!t||guard.current)return false;try{if(t.status==='complete'){if(!work?.blob)throw Error('请先恢复并下载作品');remember(undefined);setWork(undefined);setError('');return true;}if(t.status==='rejected'){const c=await getLabConfig();await prepareRejectedTest(c,t.id,true);remember(undefined);setWork(undefined);setError('');return true;}throw Error('任务仍未知，不能解除锁，请仅查询已有任务');}catch(e){setError(formatLabError(e,'query'));return false;}}
 return{task,work,setWork,config,registry,busy,error,notice,setError,connect,start,query,recover,prepareAgain};
}
export function MusicProvider({children}:{children:ReactNode}){const value=useMusicState();return <Context.Provider value={value}>{children}</Context.Provider>;}
export function useMusic(){const value=useContext(Context);if(!value)throw Error('需要MusicProvider');return value;}
