import {useEffect,useRef,useState} from 'react';
import {ActionButton} from './Controls';
import {archiveLegacyTask,fetchAudioResult,formatLabError,getJobRegistry,type LabConfig,type LocalJobRecord} from '../services/composition/audioLabClient';
import type {LabTask} from '../services/composition/labSession';
/** 全部自动加载只读本地；查询上游或归档都必须单独点击。 */
export function LegacyRecovery({config,task,busy,onArchived,onBlocked}:{config:LabConfig;task?:LabTask;busy:boolean;onArchived:()=>void;onBlocked:(reason:string)=>void}){
 const [records,setRecords]=useState<LocalJobRecord[]>([]),[message,setMessage]=useState(''),[working,setWorking]=useState(false),[open,setOpen]=useState(false);
 const [typedId,setTypedId]=useState(''),[reason,setReason]=useState(''),[account,setAccount]=useState(false),[original,setOriginal]=useState(false),[risk,setRisk]=useState(false);
 const guard=useRef(false);const [download,setDownload]=useState<{id:string;blob:Blob}>(),[url,setUrl]=useState('');
 useEffect(()=>{if(!download)return;const value=URL.createObjectURL(download.blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[download]);
 async function refresh(signal?:AbortSignal){
  try{const data=await getJobRegistry(config,signal);if(signal?.aborted)return;setRecords(data.records);const blocking=data.records.filter(r=>r.blocksSubmission);onBlocked(!data.journalHealthy?'本地任务审计记录不可用，禁止提交':blocking.length?`后端还有${blocking.length}条运行中或未核实的任务记录，请先核查任务清单`: '');}
  catch(error){if(!signal?.aborted){setMessage(formatLabError(error,'query'));onBlocked('本地任务清单尚未核实，请刷新服务或重启最新版后端');}}
 }
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[config]);
 async function query(id:string){
  if(guard.current||busy)return;guard.current=true;setWorking(true);
  try{const blob=await fetchAudioResult(config,id);if(blob){setDownload({id,blob});setMessage(`任务${id}已返回音频；只执行结果查询，没有提交生成。`);}else setMessage(`任务${id}尚未返回音频，可稍后再次仅查询；不会自动轮询。`);await refresh();}
  catch(error){setMessage(formatLabError(error,'query'));await refresh();}
  finally{guard.current=false;setWorking(false);}
 }
 async function archive(){
  if(!task||!task.canManualRecover||guard.current||busy||typedId!==task.id||reason.trim().length<20||!account||!original||!risk)return;
  guard.current=true;setWorking(true);
  try{const result=await archiveLegacyTask(config,task.id,{typedId,reason,acknowledgedAccount:account,acknowledgedOriginalError:original,acknowledgedRisk:risk});if(!result.archived)throw Error('审计归档未确认');await refresh();onArchived();setOpen(false);setMessage('人工审计已保存，旧任务仍为未知；本操作未查询或生成AI。其他未核实任务仍会阻止新提交。');}
  catch(error){setMessage(formatLabError(error,'setup'));}
  finally{guard.current=false;setWorking(false);}
 }
 return <section className="panel lab-panel" aria-labelledby="legacy-recovery-title"><h2 id="legacy-recovery-title">本地任务清单与人工恢复</h2>
  <p>以下是已保存的本地状态，pending不代表上游现在仍在运行；本地404、余额未变和另一首已下载作品均不能证明旧任务未创建。</p>
  <ActionButton tone="surface" disabled={busy||working} onClick={()=>void refresh()}>刷新任务清单（仅本地）</ActionButton>
  {records.length?<ul>{records.map(record=><li key={record.id}><p>{record.id} ({record.executionMode??config.mode}) · {record.generationMode==='text-to-audio'?'模式A：完整作曲':'模式B：参考转换（含旧记录）'} · {record.recovery?'已人工归档，状态仍未知':record.status} · {record.duration??'未知'}秒 · 创建时间 {record.createdAt??'未记录'} · 更新时间 {record.updatedAt??'未记录'}</p>{record.upstreamId&&<p>上游ID：{record.upstreamId}</p>}{record.recovery&&<p>人工归档时间 {record.recovery.at}；原结论仍未知。核查说明：{record.recovery.reason}</p>}{record.queryError&&<p>最近查询错误：{record.queryError}</p>}{(record.upstreamId||record.executionMode==='mock'&&record.status==='complete')&&<ActionButton tone="surface" disabled={busy||working||record.requiresModeSwitch} onClick={()=>void query(record.id)}>仅查询记录 {record.id}</ActionButton>}</li>)}</ul>:<p>未找到本地记录，不等于上游没有任务。</p>}
  {url&&download&&<><p>查询结果属于任务 {download.id}，不要与当前页面的旧锁混淆。</p><audio controls src={url} aria-label="试听清单任务查询结果"/><a className="action surface" href={url} download={`wanwu-recovered-${download.id}.${download.blob.type.includes('wav')?'wav':'mp3'}`}>下载此记录音频</a></>}
  {task?.canManualRecover&&<ActionButton tone="surface" disabled={busy||working} onClick={()=>{setOpen(true);setTypedId('');setReason('');setAccount(false);setOriginal(false);setRisk(false);}}>旧版记录丢失：人工恢复说明</ActionButton>}
  {open&&task&&<section aria-label="旧任务人工恢复确认"><p>无法确认旧任务是否创建、生成或计费。此操作只登记人工核查并归档当前未知锁，不证明任务失败，不取消上游任务，也不阻止旧任务未来产生费用；再次生成仍可能重复计费。优先联系Stability支持核对。不会解除其他运行中或有可靠提交记录的任务锁。</p>
   <label><input type="checkbox" checked={account} onChange={e=>setAccount(e.target.checked)}/>我已核对Stability账户、账单及可用任务信息。</label>
   <label><input type="checkbox" checked={original} onChange={e=>setOriginal(e.target.checked)}/>我已核对原始错误和可用日志，没有找到该旧任务的可靠上游ID。</label>
   <label><input type="checkbox" checked={risk} onChange={e=>setRisk(e.target.checked)}/>我理解状态仍未知及可能重复计费的风险，并明确选择人工归档后继续。</label>
   <label htmlFor="recovery-id">输入完整旧任务ID</label><input id="recovery-id" value={typedId} onChange={e=>setTypedId(e.target.value)}/>
   <label htmlFor="recovery-reason">核查说明（20–1000字，不填写密钥）</label><textarea id="recovery-reason" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/>
   <ActionButton disabled={busy||working||typedId!==task.id||reason.trim().length<20||!account||!original||!risk} onClick={()=>void archive()}>保存审计并人工归档（不生成）</ActionButton>
   <ActionButton tone="surface" disabled={working} onClick={()=>setOpen(false)}>取消人工恢复</ActionButton>
  </section>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
