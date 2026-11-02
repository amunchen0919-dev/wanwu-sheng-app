import {MusicIntentPanel} from '../components/MusicIntentPanel';
import {PostMixPanel} from '../components/PostMixPanel';
import {extractMusicIntent,type GenerationMode} from '../services/composition/musicIntent';
import {buildIntentPrompt} from '../services/composition/intentPrompt';
import {LegacyRecovery} from '../components/LegacyRecovery';
import {inspectAudioQuality,type AudioQuality} from '../services/composition/quality';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Page} from '../components/Page';
import {ActionButton} from '../components/Controls';
import {useCreation} from '../app/CreationContext';
import {paths} from '../app/routes';
import {useRhythmPlayback} from '../services/rhythm/useRhythmPlayback';
import {renderReference} from '../services/composition/reference';
import {AUDIO_LAB_DURATIONS,AUDIO_LAB_PRICE} from '../types/audioLabOptions';
import {NINETY_SECOND_DIRECTION,buildAudioPrompt,buildSubmissionPrompt,type Retention} from '../services/composition/prompt';
import {fetchAudioResult,getLabConfig,getLocalTaskStatus,submitAudio,prepareRejectedTest,formatLabError,LabRequestError,type LabConfig} from '../services/composition/audioLabClient';
import {readLabSession,writeLabSession,type LabTask} from '../services/composition/labSession';
import {loadLabReference,saveLabReference} from '../services/storage/labReference';
function useBlobUrl(blob?:Blob){const[url,setUrl]=useState('');useEffect(()=>{if(!blob){setUrl('');return;}const next=URL.createObjectURL(blob);setUrl(next);return()=>URL.revokeObjectURL(next);},[blob]);return url;}
const taskLabels={unknown:'状态未知，保持锁定',submitting:'提交中，保持锁定',pending:'生成中，保持锁定',complete:'已有结果，请先查询/下载',rejected:'已明确拒绝，可确认后重新准备',error:'任务失败，需核对是否已生成或计费'};
export default function AudioLab(){
  const {draft,sounds,sessionId}=useCreation();const rhythm=useRhythmPlayback();
  const selected=useMemo(()=>sounds.filter(sound=>draft.selectedSoundIds.includes(sound.id)),[sounds,draft.selectedSoundIds]);
  const intent=useMemo(()=>extractMusicIntent(draft.rhythm,selected,draft.preferenceText),[draft.rhythm,selected,draft.preferenceText]);
  const storageKey=`wanwu:audio-lab:${sessionId}`;
  const [initial]=useState(()=>readLabSession(storageKey));
  const promptAutomatic=useRef(initial.promptIsAutomatic??initial.prompt===undefined);
  const modePrompts=useRef<Partial<Record<GenerationMode,string>>>(initial.promptsByMode??{});
  const [generationMode,setGenerationMode]=useState<GenerationMode>(initial.generationMode??'text-to-audio');
  const [mixEnabled,setMixEnabled]=useState(initial.mixEnabled??false),[mixIntensity,setMixIntensity]=useState<Retention>(initial.mixIntensity??'low');
  const [prompt,setPrompt]=useState(initial.prompt??(generationMode==='text-to-audio'?buildIntentPrompt(intent,initial.duration):(initial.duration===90?NINETY_SECOND_DIRECTION:buildAudioPrompt(draft.preferenceText,selected).prompt)));
  const [strength,setStrength]=useState(initial.strength),[duration,setDuration]=useState(initial.duration),[mockScenario,setMockScenario]=useState(initial.scenario);
  useEffect(()=>{if(promptAutomatic.current&&generationMode==='text-to-audio')setPrompt(buildIntentPrompt(intent,duration));},[intent,duration,generationMode]);
  const [task,setTask]=useState<LabTask|undefined>(initial.task);const taskRef=useRef(task);taskRef.current=task;
  const [config,setConfig]=useState<LabConfig>(),[connecting,setConnecting]=useState(false),[checking,setChecking]=useState(false);
  const [retention,setRetention]=useState<Retention>(initial.retention??'low');
  const submissionPrompt=generationMode==='text-to-audio'?`${prompt.trim()}\nTarget duration: ${duration} seconds. Compose an independent complete instrumental song; do not extend or loop any recording. No vocals. Full musical development with a natural ending.`:buildSubmissionPrompt(prompt,duration,retention);
  const [quality,setQuality]=useState<AudioQuality>(),[qualityNote,setQualityNote]=useState('尚未检查音频质量'),[qualitySource,setQualitySource]=useState('');
  const qualityRevision=useRef(0);
  const price=config?.pricing??AUDIO_LAB_PRICE;
  const [reference,setReference]=useState<Blob>(),[result,setResult]=useState<Blob>();
  const [resultMode,setResultMode]=useState<'mock'|'live'>();
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[resetOpen,setResetOpen]=useState(false),[resetAcknowledged,setResetAcknowledged]=useState(false);
  const [status,setStatus]=useState(initial.task?'恢复了历史任务锁；不会自动提交或查询上游':'尚未提交生成任务');
  const [backendBlock,setBackendBlock]=useState('');
  const [error,setError]=useState(''),[storageError,setStorageError]=useState(''),[referenceNote,setReferenceNote]=useState('尚未加载参考音频');
  const lock=useRef(false),controller=useRef<AbortController|null>(null),connection=useRef<AbortController|null>(null),referenceRevision=useRef(0);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const refAudio=useRef<HTMLAudioElement>(null),resultAudio=useRef<HTMLAudioElement>(null);
  const referenceUrl=useBlobUrl(reference),resultUrl=useBlobUrl(result);
  function snapshot(nextTask:LabTask|undefined){return{version:1 as const,prompt,strength,duration,scenario:mockScenario,retention,generationMode,promptIsAutomatic:promptAutomatic.current,promptsByMode:{...modePrompts.current,[generationMode]:prompt},mixEnabled,mixIntensity,task:nextTask};}
  useEffect(()=>{try{writeLabSession(storageKey,snapshot(task));setStorageError('');}catch{setStorageError('无法保存测试状态，为避免刷新重复计费，已禁止提交。请检查Safari网站存储权限。');}},[storageKey,prompt,strength,duration,mockScenario,retention,generationMode,mixEnabled,mixIntensity,task]);
  async function inspect(current:LabConfig,signal:AbortSignal){
    const id=taskRef.current?.id;if(!id)return;setChecking(true);
    try{
      const local=await getLocalTaskStatus(current,id,signal);signal.throwIfAborted();
      setTask(old=>old?.id===id?{...old,...local,canPrepare:!old.conflict&&local.canPrepare,error:old.conflict?old.error:local.error??old.error}:old);
    }catch(e){if(!signal.aborted){setTask(old=>old?.id===id?{...old,state:'unknown',canPrepare:false}:old);setError(formatLabError(e,'query'));}}
    finally{if(!signal.aborted)setChecking(false);}
  }
  async function connect(){
    connection.current?.abort();const control=new AbortController();connection.current=control;
    setConnecting(true);setConfig(undefined);setConfirmed(false);
    try{const current=await getLabConfig(control.signal);control.signal.throwIfAborted();
      if(current.uiProtocol!==2)throw new LabRequestError('后端版本过旧，请停止旧后端并重新运行npm run dev:api，然后刷新页面','setup',{code:'BACKEND_VERSION'});
      setConfig(current);setError('');await inspect(current,control.signal);
    }catch(e){if(!control.signal.aborted)setError(formatLabError(e,'setup'));}
    finally{if(!control.signal.aborted){setConnecting(false);setChecking(false);}}
  }
  useEffect(()=>{
    setConfirmed(false);lock.current=false;setBusy(false);void connect();
    return()=>{connection.current?.abort();controller.current?.abort();clearTimeout(timer.current);};
  },[]);
  useEffect(()=>{
    let active=true;const revision=referenceRevision.current;
    void loadLabReference(sessionId).then(blob=>{if(active&&revision===referenceRevision.current){if(blob?.size){setReference(blob);setReferenceNote('已恢复30秒参考音频；这不代表生成任务已解锁');}else setReferenceNote('尚无参考缓存，可制作参考音频');}}).catch(()=>{if(active&&revision===referenceRevision.current)setReferenceNote('参考缓存不可用；当前参考仍可使用，刷新后可能需要重新制作');});
    return()=>{active=false;};
  },[sessionId]);
  function control(){controller.current?.abort();const current=new AbortController();controller.current=current;return current;}
  function stopAudio(){rhythm.stop();refAudio.current?.pause();resultAudio.current?.pause();}
  function rememberFailure(e:unknown){
    setTask(old=>{if(!old)return old;const problem=e instanceof LabRequestError?e:undefined;
      const rejected=problem?.stage==='upload'&&!problem.submissionUnknown&&[400,413,415,422].includes(problem.httpStatus??0);
      return{...old,state:rejected?'rejected':problem?.stage==='generation'?'error':'unknown',canPrepare:!!rejected,error:formatLabError(e, 'query')};
    });
  }
  async function prepare(){
    if(lock.current)return;lock.current=true;setBusy(true);const current=control();referenceRevision.current++;stopAudio();setConfirmed(false);
    try{if(selected.length!==draft.selectedSoundIds.length)throw Error('所选素材尚未加载或缺失');
      const blob=await renderReference(draft.rhythm,selected,current.signal);current.signal.throwIfAborted();setReference(blob);setReferenceNote('30秒参考音频已准备；任务锁和付费确认需另行检查');
      try{await saveLabReference(sessionId,blob);if(!current.signal.aborted)setReferenceNote('30秒参考音频已准备并缓存，可试听和下载');}catch{if(!current.signal.aborted)setReferenceNote('参考音频已准备，但缓存失败；请下载保留，刷新后可能需要重新制作');}
    }catch(e){if(!current.signal.aborted)setError(formatLabError(e,'reference'));}
    finally{if(controller.current===current){lock.current=false;setBusy(false);}}
  }
  async function checkQuality(blob:Blob,label:string,signal?:AbortSignal){
    const revision=++qualityRevision.current;setQuality(undefined);setQualitySource(label);setQualityNote('正在本地解码检查；不会调用AI');
    try{const report=await inspectAudioQuality(blob,taskRef.current?.duration??duration,signal);if(revision===qualityRevision.current&&!signal?.aborted){setQuality(report);setQualityNote('检查完成；仅检测时长和近静音，不能评价旋律、和声或审美质量。');}}
    catch(e){if(revision===qualityRevision.current&&!signal?.aborted)setQualityNote(`质量检查未完成：${e instanceof Error?e.message:'解码失败'}。仍可下载并人工检查，不能据此认定作品完整。`);}
  }
  async function retrieve(currentConfig:LabConfig,id:string,signal:AbortSignal){
    for(let i=0;i<60;i++){
      const blob=await fetchAudioResult(currentConfig,id,signal);signal.throwIfAborted();
      if(blob){const source=taskRef.current?.executionMode??currentConfig.mode;setResultMode(source);setResult(blob);void checkQuality(blob,source==='mock'?'Mock测试音频（不是AI作品）':'AI返回音乐',signal);setTask(old=>old?.id===id?{...old,state:'complete',canPrepare:false}:old);setStatus(source==='mock'?'Mock完成：仅用于测试音频流程，未调用AI':'结果已返回，请试听并下载');return;}
      setTask(old=>old?.id===id?{...old,state:'pending',canPrepare:false}:old);setStatus(`正在等待结果（查询${i+1}/60），不重复提交`);
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer.current);reject(new DOMException('已停止查询','AbortError'));};signal.addEventListener('abort',abort,{once:true});timer.current=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},10000);});
    }
    throw new LabRequestError('查询达到本轮上限，请稍后仅查询，不重新生成','query',{code:'QUERY_LIMIT'});
  }
  const reasons:string[]=[];
  if(backendBlock)reasons.push(backendBlock);
  if(busy)reasons.push('当前操作尚未完成');
  if(!config)reasons.push(connecting?'正在连接本地后端，尚未确认Mock/Live模式':'后端未连接或版本不匹配，请刷新服务状态');
  if(config?.allowedDurations&&!config.allowedDurations.includes(duration))reasons.push('当前后端未提供该目标时长，请重启后端');
  if(checking)reasons.push('正在核对本地任务记录');
  if(task)reasons.push(`存在任务锁：${taskLabels[task.state]}`);
  if(storageError)reasons.push('测试状态无法持久化');
  if(generationMode==='audio-to-audio'&&!reference)reasons.push('本页尚未加载有效参考音频');
  if(!prompt.trim()||submissionPrompt.trim().length>10000)reasons.push('英文Prompt须为1–10000字符');
  if(generationMode==='text-to-audio'&&config&&!config.generationModes?.includes('text-to-audio'))reasons.push('后端尚未支持Text-to-Audio，请重启最新版后端');
  if(generationMode==='text-to-audio'&&(!draft.rhythm.length||!selected.length||selected.length!==draft.selectedSoundIds.length))reasons.push('请先录制节奏并等待所选素材完整加载');
  if(generationMode==='audio-to-audio'&&(!Number.isFinite(strength)||strength<0||strength>.6))reasons.push('变换强度须为0–0.6');
  if(config?.mode==='live'&&!confirmed)reasons.push('尚未勾选本次真实付费确认（刷新、参数修改或重新准备后都需重选）');
  async function generate(){
    if(lock.current||reasons.length||!config||(generationMode==='audio-to-audio'&&!reference))return;
    const current=control();const id=crypto.randomUUID();const next:LabTask={id,state:'submitting',canPrepare:false,executionMode:config.mode,generationMode,duration};
    lock.current=true;setBusy(true);setError('');setConfirmed(false);stopAudio();
    try{writeLabSession(storageKey,snapshot(next));setTask(next);setStatus('正在主动提交本次请求，仅一次');
      await submitAudio(config,id,generationMode==='audio-to-audio'?reference:undefined,submissionPrompt,strength,confirmed,current.signal,duration,mockScenario,generationMode);current.signal.throwIfAborted();
      setTask({...next,state:'pending'});await retrieve(config,id,current.signal);
    }catch(e){if(!current.signal.aborted){rememberFailure(e);setError(`${formatLabError(e,'upload')}。不会自动重新提交。`);setStatus('请求已停止；参考音频、Prompt和参数保留');}}
    finally{if(controller.current===current){lock.current=false;setBusy(false);}}
  }
  async function resume(){
    if(!task||!config||lock.current)return;const current=control();lock.current=true;setBusy(true);setError('');
    try{await retrieve(config,task.id,current.signal);}catch(e){if(!current.signal.aborted){rememberFailure(e);setError(formatLabError(e,'query'));}}
    finally{if(controller.current===current){lock.current=false;setBusy(false);}}
  }
  function clearTask(message:string){writeLabSession(storageKey,snapshot(undefined));setTask(undefined);setConfirmed(false);setResult(undefined);qualityRevision.current++;setQuality(undefined);setQualityNote('尚未检查音频质量');setError('');setResetOpen(false);setResetAcknowledged(false);setStatus(message);}
  async function prepareAgain(){
    if(!config||!task?.canPrepare||!resetAcknowledged||lock.current)return;const current=control();lock.current=true;setBusy(true);
    try{const response=await prepareRejectedTest(config,task.id,true,current.signal);current.signal.throwIfAborted();
      if(!response.prepared)throw Error('无法确认解除锁');clearTask('已重新准备：参考音频、Prompt和参数保留；再次勾选付费确认后才可主动生成');
    }catch(e){if(!current.signal.aborted){setError(formatLabError(e,'setup'));await inspect(config,current.signal);}}
    finally{if(controller.current===current){lock.current=false;setBusy(false);}}
  }
  return <Page title="Stable Audio 测试" back={paths.prepare}>
    <p className="subtitle">实验室版本 state-v2 · {config?config.mode==='mock'?'Mock模式（不调用AI）':'真实付费模式':'后端模式未确认'} · {generationMode==='text-to-audio'?'独立完整作曲':'30秒参考转换'} → {duration}秒目标</p>
    {config&&<section className="panel lab-panel" aria-labelledby="lab-runtime-title"><h2 id="lab-runtime-title">实际后端服务</h2>
      <p>接口 /api/audio-lab/config 返回模式：{config.mode==='live'?'Live（使用付费接口）':'Mock（免费测试）'}。页面不从前端.env推断运行模式。</p>
      {config.runtime?<><p>进程 PID {config.runtime.pid} · 启动时间 {config.runtime.startedAt} · 实例 {config.runtime.instanceId}</p><p>进程请求 {config.runtime.requestedMode} · .env记录 {config.runtime.envFileMode} · 密钥{config.runtime.keyConfigured?'已配置（不展示）':'未加载'}。</p><p role="status">{config.runtime.explanation}</p></>:<p>当前是没有启动诊断的旧后端，请停止8787旧服务后重新启动。</p>}
      <p>切换Live：原后端终端Ctrl+C，再运行 npm run dev:api:live，然后点击“刷新服务状态（仅本地）”。修改.env或刷新Safari不能改变已运行进程。</p>
    </section>}
    <section className="panel lab-panel" aria-labelledby="lab-task-title"><h2 id="lab-task-title">测试状态与操作</h2>
      <p>{task?`本地任务：${task.id} · ${taskLabels[task.state]}`:'没有本轮任务锁。准备参考音频和付费确认是独立条件。'}</p>
      {task&&task.executionMode!=='mock'&&<p>提交证据：{task.upstreamId?'已收到上游任务ID，可仅查询恢复':task.outcome==='rejected'?'已明确拒绝': '未能确认是否创建任务；余额未变化不能用于解锁'}。本地请求ID不等于上游任务ID。</p>}
      {task?.executionMode==='mock'&&<p>历史任务来源：Mock，本地免费测试，没有付费上游任务ID。{task.state==='complete'?'任务已完成，可仅查询恢复测试音频，试听/下载后显式准备下一次测试。':'请在Mock服务中继续核对本地任务。'}</p>}
      {task?.requiresModeSwitch&&<p>找到其他运行模式或账户的历史记录，请切回对应服务查询；不表示任务丢失或失败，不自动解锁。</p>}
      {task?.upstreamId&&<p>上游任务ID：{task.upstreamId}</p>}
      {task?.diagnostic&&<p>诊断来源：{task.diagnostic.source==='local-transport'?'本地网络请求异常（不是已收到的上游HTTP错误）':'已收到上游HTTP响应'}；原因代码 {task.diagnostic.cause}；经过 {task.diagnostic.elapsedMs} ms；提交超时上限 {task.diagnostic.timeoutMs} ms。</p>}
      {task&&task.executionMode!=='mock'&&!task.upstreamId&&<p>如果原始日志没有保存上游ID，官方结果查询接口无法按本地请求ID找回。请保留锁并联系Stability支持，提供请求时间和错误信息核查；不要以余额未变或404作为未创建的证明。</p>}
      {task?.error&&<p className="feedback">上次任务记录：{task.error}</p>}
      {task?.state==='unknown'&&<p>后端重启或旧版只保存ID时，无法确认生成结果与计费。请核对Stability账户任务、原始错误和服务日志。状态未知时保持锁定，不要清空网站存储绕过；必要时带错误ID联系支持核查。</p>}
      <ActionButton tone="surface" disabled={busy||connecting} onClick={()=>void connect()}>刷新服务状态（仅本地）</ActionButton>
      <ActionButton tone="surface" disabled={busy||!config||checking||!!task&&!task.canPrepare} aria-describedby="lab-reset-reason" onClick={()=>{setConfirmed(false);if(task){setResetOpen(true);setResetAcknowledged(false);}else setStatus('没有任务锁，无需解除。参考和参数保留；请查看下方生成按钮条件。');}}>重新准备测试（不生成）</ActionButton>
      <p id="lab-reset-reason">{task?.state==='complete'?'这是已完成任务，不适用拒绝任务的重置入口。请仅查询并下载音频，再使用结果下方“准备下一次测试（不立即生成）”。':task&&!task.canPrepare?'当前任务未被核实为提交前拒绝，不可直接解除锁。可刷新本地记录或仅查询已有任务。':'重新准备不会调用AI，也不会删除参考音频。'}</p>
      {task&&<ActionButton tone="surface" disabled={busy||!config||task.requiresModeSwitch} onClick={()=>void resume()}>仅查询已有任务</ActionButton>}
    </section>
    {config&&<LegacyRecovery config={config} task={task} busy={busy} onBlocked={setBackendBlock} onArchived={()=>clearTask('旧任务已按显式人工核查登记审计并归档，原状态仍未知；参考、Prompt与参数保留，付费确认已取消。')}/>}
    <section className="panel lab-panel"><h2>生成路线</h2><label htmlFor="lab-generation-mode">音乐生成模式</label><select id="lab-generation-mode" value={generationMode} disabled={busy||!!task} onChange={event=>{const mode=event.target.value as GenerationMode;modePrompts.current[generationMode]=prompt;setGenerationMode(mode);promptAutomatic.current=mode==='text-to-audio'&&!modePrompts.current[mode];setPrompt(modePrompts.current[mode]??(mode==='text-to-audio'?buildIntentPrompt(intent,duration):(duration===90?NINETY_SECOND_DIRECTION:buildAudioPrompt(draft.preferenceText,selected).prompt)));setConfirmed(false);}}><option value="text-to-audio">模式 A：完整音乐创作（新默认）</option><option value="audio-to-audio">模式 B：参考音频转换（旧实验模式）</option></select>
    <p>{generationMode==='text-to-audio'?'MusicIntent → Text-to-Audio 独立作曲 → 可选本地混音。不会上传30秒参考音频。':'旧Audio-to-Audio转换可能无法可靠将30秒素材扩展为完整90秒，不保证后半段有效声音。'}</p>
    <label><input type="checkbox" checked={mixEnabled} disabled={busy} onChange={event=>{setMixEnabled(event.target.checked);setConfirmed(false);}}/>将少量用户原始声音融入最终作品（仅本地，可关闭）</label>
    <label htmlFor="lab-mix-intensity">原始声音混入强度</label><select id="lab-mix-intensity" value={mixIntensity} disabled={busy||!mixEnabled} onChange={event=>{setMixIntensity(event.target.value as Retention);setConfirmed(false);}}><option value="low">低 · 轻微点缀</option><option value="medium">中 · 适度特色</option><option value="high">高 · 更多短装饰</option></select></section>
    <MusicIntentPanel intent={intent}/>
    <section className="panel lab-panel"><h2>当前参考音频</h2><p>{draft.rhythm.length}次敲击 · {selected.length}个声音</p><p>{selected.map(sound=>sound.name).join('、')}</p><p>{referenceNote}</p>
      <ActionButton tone="surface" disabled={!draft.rhythm.length} onClick={()=>{refAudio.current?.pause();resultAudio.current?.pause();void rhythm.toggle(draft.rhythm);}}>{rhythm.playing?'停止原始节奏':'试听原始节奏'}</ActionButton>
      <ActionButton disabled={busy||!draft.rhythm.length||!selected.length} onClick={()=>void prepare()}>制作30秒参考音频</ActionButton>
      <p>制作参考不会解除任务锁，也不会调用AI；不更改原始节奏和素材。</p>
      {referenceUrl&&<><audio ref={refAudio} controls src={referenceUrl} aria-label="试听本地参考音频" onPlay={()=>{rhythm.stop();resultAudio.current?.pause();}}/><a className="action surface" href={referenceUrl} download="wanwu-stable-audio.wav">下载参考 WAV</a></>}
    </section>
    <section className="panel lab-panel"><h2>发送给AI的内容</h2><p>中文偏好采用关键词转换，英文可补充修改。修改参数不会自动提交。</p>
      {generationMode==='text-to-audio'&&<ActionButton tone="surface" disabled={busy} onClick={()=>{promptAutomatic.current=true;setPrompt(buildIntentPrompt(intent,duration));setConfirmed(false);}}>根据当前特征重新生成描述（不调用AI）</ActionButton>}
      <label htmlFor="lab-prompt">英文音乐描述（可编辑）</label><textarea id="lab-prompt" value={prompt} maxLength={10000} disabled={busy} onChange={event=>{promptAutomatic.current=false;setPrompt(event.target.value);setConfirmed(false);}}/>
      {generationMode==='audio-to-audio'&&<><label htmlFor="lab-strength">变换强度（0–0.6，默认0.6）</label><input id="lab-strength" type="number" min="0" max="0.6" step="0.1" value={strength} disabled={busy} onChange={event=>{setStrength(Number(event.target.value));setConfirmed(false);}}/></>}
      <label htmlFor="lab-duration">目标作品时长（参考音频保持30秒）</label><select id="lab-duration" value={duration} disabled={busy} onChange={event=>{const next=Number(event.target.value);if(generationMode==='text-to-audio'&&prompt===buildIntentPrompt(intent,duration))setPrompt(buildIntentPrompt(intent,next));if(generationMode==='audio-to-audio'&&next===90&&prompt===buildAudioPrompt(draft.preferenceText,selected).prompt)setPrompt(NINETY_SECOND_DIRECTION);setDuration(next);setConfirmed(false);}}>{AUDIO_LAB_DURATIONS.map(seconds=><option key={seconds} value={seconds}>{seconds===90?'90 秒 · 完整编曲测试':`${seconds}秒`}</option>)}</select>
      {duration===90&&<><p>新版策略以30秒参考作为灵感，默认优先主旋律、和声和完整歌曲。历史自定义Prompt会保留，请主动替换旧的严格保留指令。</p><ActionButton tone="surface" disabled={busy||!!task} onClick={()=>{promptAutomatic.current=generationMode==='text-to-audio';setPrompt(generationMode==='text-to-audio'?buildIntentPrompt(intent,90):NINETY_SECOND_DIRECTION);setConfirmed(false);}}>使用新版90秒默认描述</ActionButton></>}
      {generationMode==='audio-to-audio'&&<><label htmlFor="lab-retention">参考素材保留程度</label><select id="lab-retention" value={retention} disabled={busy} onChange={event=>{setRetention(event.target.value as Retention);setConfirmed(false);}}><option value="low">低（默认）：少量特征，优先旋律、和声和完整性</option><option value="medium">中：适度保留节奏动机和特色声音</option><option value="high">高：尽量保留原始节奏和声音元素</option></select>
      <p>保留程度通过Prompt表达，不是模型保证；变换强度仍是独立的官方strength参数。</p></>}
      <label htmlFor="lab-submission-prompt">实际发送的完整Prompt（只读预览）</label><textarea id="lab-submission-prompt" readOnly value={submissionPrompt}/>
      <p>预计计费：{config?.mode==='live'?`${price.credits} credits／成功生成（约 US$${price.usd.toFixed(2)}）`:config?'Mock 0 credits，不调用AI':'后端模式尚未确认，当前不可提交'}。返回音频但本地质量检查不合格，也可能已按成功生成计费；不会自动重试。官方价格核对日期 {price.checkedAt}，实际以账户结算为准；30秒和90秒采用相同固定计费。<a href="https://docs.stability.ai/pricing" target="_blank" rel="noreferrer">查看官方价格</a></p>
      {config?.mode==='mock'&&<><label htmlFor="lab-scenario">Mock模拟场景</label><select id="lab-scenario" value={mockScenario} disabled={busy} onChange={event=>setMockScenario(event.target.value)}><option value="success">成功</option><option value="upload-error">上传失败</option><option value="generation-error">生成失败</option><option value="query-error">查询失败</option></select><p>{generationMode==='text-to-audio'?'Mock提供目标时长的确定性合成测试曲（不是AI作曲，不验证模型音乐性）。':'Mock回传原30秒参考，不冒充真实长曲。'}</p></>}
      {config?.mode==='live'?<label className="lab-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>我确认本次请求生成{duration}秒音乐，预计消耗{price.credits} credits（约 US${price.usd.toFixed(2)}）；本次确认不跨刷新或重新准备保留。</label>:<p>{config?'Mock不需要付费确认。':'付费确认暂不可用：本地后端未连接或版本不匹配，无法确认Live模式。'}</p>}
      <ActionButton disabled={reasons.length>0} aria-describedby="lab-disabled-reasons" onClick={()=>void generate()}>测试 AI 编曲{config?.mode==='mock'?'（Mock）':''}</ActionButton>
      <div id="lab-disabled-reasons"><p>{reasons.length?'暂不能生成，原因如下：':'所有条件已满足；只有主动点击才提交。'}</p>{reasons.length>0&&<ul>{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}</div>
    </section>
    {resetOpen&&<section className="panel lab-panel" aria-label="重新准备测试确认"><p>后端已核实为明确拒绝。请再次确认没有生成结果；只解除本地记录，不会调用AI。</p><label><input type="checkbox" checked={resetAcknowledged} onChange={event=>setResetAcknowledged(event.target.checked)}/>我确认上次请求已被明确拒绝，且没有生成结果。</label><ActionButton disabled={busy||!resetAcknowledged} onClick={()=>void prepareAgain()}>确认重新准备（不调用AI）</ActionButton><ActionButton tone="surface" disabled={busy} onClick={()=>setResetOpen(false)}>取消</ActionButton></section>}
    <p role="status" aria-live="polite" className="feedback">{status}</p>{(error||storageError||rhythm.error)&&<p role="alert">{error||storageError||rhythm.error}</p>}
    <section className="panel lab-panel" aria-labelledby="lab-quality-title"><h2 id="lab-quality-title">音频质量检查（仅本地）</h2>
      <label htmlFor="lab-quality-file">检查已有音频文件（不上传、不生成）</label><input id="lab-quality-file" type="file" accept="audio/*" onChange={event=>{const file=event.target.files?.[0];if(file)void checkQuality(file,file.name);event.target.value='';}}/>
      <p role="status">{qualitySource} {qualityNote}</p>
      {quality&&<><p>实际时长 {quality.duration.toFixed(1)}秒 · 目标 {quality.expectedDuration}秒 · 有效声音约 {quality.activeSeconds.toFixed(1)}秒 · 最长连续近静音 {quality.longestSilence.toFixed(1)}秒 · 结尾近静音 {quality.trailingSilence.toFixed(1)}秒。</p><p>检测标准：100毫秒窗口，RMS低于−60 dBFS视为近静音，包含极弱声音，不等于逐样本全零。</p>
      <p>技术验收：{quality.warnings.length?'不合格，不能认定为完整作品':'未发现当前指标异常，音乐性需人工试听'}；峰值 {quality.peakDb?.toFixed(1)??'未记录'} dBFS，削波采样比例 {((quality.clippedSampleRatio??0)*100).toFixed(3)}%。</p>
      {quality.warnings.length?<div role="alert"><strong>质量警告：任务返回音频不等于作品完整。</strong><ul>{quality.warnings.map(w=><li key={w}>{w}</li>)}</ul><p>不会自动重新生成或扣费；请下载保留并人工试听。</p></div>:<p>未发现所检查的长静音或时长异常；音乐是否符合预期仍需人工试听。</p>}</>}
    </section>
    <PostMixPanel music={result} intent={intent} sounds={selected} enabled={mixEnabled} intensity={mixIntensity} duration={task?.duration??duration}/>
    {resultUrl&&<section className="panel lab-panel"><h2>{resultMode==='mock'?((task?.generationMode??generationMode)==='text-to-audio'?'Mock完整流程测试音频（非AI作品）':'Mock返回音频（与参考相同）'):'AI返回音乐'}</h2><audio ref={resultAudio} controls src={resultUrl} aria-label="试听测试结果" onPlay={()=>{rhythm.stop();refAudio.current?.pause();}}/><a className="action mint" href={resultUrl} download={`wanwu-${resultMode==='mock'?'mock.wav':'stable-audio.mp3'}`}>下载测试音频</a><ActionButton tone="surface" onClick={()=>{try{clearTask('结果已由用户确认完成，重新准备后仍需再次确认付费');}catch{setError('无法保存测试状态');}}}>准备下一次测试（不立即生成）</ActionButton></section>}
  </Page>;
}
