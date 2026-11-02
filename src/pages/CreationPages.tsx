import {useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {useRhythmPlayback} from '../services/rhythm/useRhythmPlayback';
import {Page} from '../components/Page';
import {ActionButton,ActionLink,Panel} from '../components/Controls';
import {paths} from '../app/routes';
import {useCreation} from '../app/CreationContext';
import {useMusic} from '../app/MusicContext';
import {SoundPreview,useSoundPlayback} from '../components/SoundPreview';
import {AUDIO_LAB_PRICE} from '../types/audioLabOptions';
import {musicRepository,type MusicWork} from '../services/storage/music';
import {mixUserSounds} from '../services/composition/postMix';
import {inspectAudioQuality} from '../services/composition/quality';
const sourceLabel=(source:MusicWork['source'])=>source==='mock'?'免费体验 · 模拟音频，非AI作品':source==='live'?'AI生成作品':'用户导入音频（来源未核实）';
function useAudioUrl(blob?:Blob){const[url,setUrl]=useState('');useEffect(()=>{if(!blob){setUrl('');return;}const u=URL.createObjectURL(blob);setUrl(u);return()=>URL.revokeObjectURL(u);},[blob]);return url;}

export function Prepare(){
 const {draft,setDraft,sounds,sessionId,libraryLoading}=useCreation(),music=useMusic(),navigate=useNavigate();
 const playback=useSoundPlayback(),rhythmPlayback=useRhythmPlayback();const [free,setFree]=useState(false),[confirmed,setConfirmed]=useState(false),[validation,setValidation]=useState('');
 useEffect(()=>{void music.connect();},[]);
 useEffect(()=>setConfirmed(false),[music.config?.mode,music.config?.runtime?.instanceId,free,draft]);
 const source=free?'mock':music.config?.mode,price=music.config?.pricing??AUDIO_LAB_PRICE;
 const missing=!draft.rhythm.length||!draft.selectedSoundIds.length||libraryLoading||draft.selectedSoundIds.some(id=>!sounds.some(s=>s.id===id));
 async function begin(){setValidation('');if(missing){setValidation('请先录制节奏，并选择至少一个可用声音');return;}if(!free&&!music.config){setValidation('音乐服务尚未连接，请重试连接或选择免费体验');return;}if(source==='live'&&!confirmed){setValidation('请先勾选本次生成费用确认');return;}
  setConfirmed(false);rhythmPlayback.stop();navigate(paths.composing);void music.start(draft,sounds,sessionId,free,confirmed,music.config?.mode,music.config?.runtime?.instanceId,price.credits);
 }
 return <Page title="AI编曲" back={paths.select} subtitle="用你的节奏与声音，编成一首歌" className="prepare-page"><div className="prepare-panels">
  <Panel title="你的节奏">{draft.rhythm.length?<><p>已记录 {draft.rhythm.length} 次敲击</p><ActionButton tone="green" onClick={()=>void rhythmPlayback.toggle(draft.rhythm)}>{rhythmPlayback.playing?'停止试听节奏':'试听节奏'}</ActionButton></>:<p>还没有录制节奏</p>}<ActionLink to={`${paths.rhythm}?next=compose`} tone="surface">修改节奏</ActionLink></Panel>
  {rhythmPlayback.error&&<p role="alert">{rhythmPlayback.error}</p>}
  <Panel title="选择的声音">{draft.selectedSoundIds.length?<ul className="sound-list">{draft.selectedSoundIds.map(id=>{const s=sounds.find(a=>a.id===id);return <li key={id}>{s?<><span>{s.name}</span><SoundPreview sound={s}/></>:<span>声音素材缺失</span>}</li>;})}</ul>:<p>还没有选择声音</p>}<ActionLink to={paths.select} tone="surface">修改声音</ActionLink></Panel>
  {playback.error&&<p role="alert">{playback.error}</p>}
  <section className="panel preference" aria-labelledby="preference-label"><label id="preference-label" htmlFor="music-preference">你希望音乐是什么感觉？</label><textarea id="music-preference" maxLength={2000} placeholder="例如：我想要安静的感觉" value={draft.preferenceText} onChange={e=>setDraft(old=>({...old,preferenceText:e.target.value}))}/><ActionButton tone="green" disabled aria-label="语音输入（尚未接入，请使用文字输入）"><span aria-hidden="true">🎙</span>按住说话</ActionButton></section>
  <Panel title="确认创作"><p>约90秒纯器乐音乐。根据你的真实敲击和已选声音特征独立作曲，优先旋律、和声和完整结构，不上传30秒参考录音。</p>
   <label className="lab-confirm"><input type="checkbox" checked={free} disabled={music.busy||!!music.task} onChange={e=>setFree(e.target.checked)}/>免费体验完整流程（本地模拟，不调用AI）</label>
   <p role="status">{free?'免费体验：0 credits，结果会明确标注为模拟音频':music.config?music.config.mode==='mock'?'服务当前为Mock免费测试，不是真实AI生成':`真实AI创作：预计${price.credits} credits（约US$${price.usd.toFixed(2)}）／次成功生成`:'正在确认音乐服务状态'}</p>
   {source==='live'&&<label className="lab-confirm"><input type="checkbox" checked={confirmed} disabled={music.busy||!!music.task} onChange={e=>setConfirmed(e.target.checked)}/>我确认本次90秒AI创作预计消耗{price.credits} credits，主动提交一次；音乐质量不合预期也可能计费。</label>}
   <p>不会自动重复生成；返回后可以选择是否低强度融入个人声音。</p>
   {!music.config&&!free&&<ActionButton tone="surface" onClick={()=>void music.connect()}>重新连接音乐服务</ActionButton>}
  </Panel>
 </div>
 {music.task?<Panel title="已有创作任务"><p>{music.task.status==='complete'?'已有作品可试听，请先查看后再显式准备下一次创作':'已有任务需要核实，不会重新提交或自动解除锁'}</p><ActionLink to={music.task.status==='complete'?paths.player:paths.composing}>查看当前任务</ActionLink></Panel>:<ActionButton disabled={music.busy} onClick={()=>void begin()}>开始编曲 →</ActionButton>}
 {(validation||music.error)&&<p role="alert">{validation||music.error}</p>}
 </Page>;
}
export function Composing(){
 const music=useMusic(),navigate=useNavigate();useEffect(()=>{if(music.work&&music.task?.status==='complete')navigate(paths.player,{replace:true});},[music.work,music.task?.status,navigate]);
 return <Page title="正在编曲" back={paths.prepare} className="composing-page"><div className="progress-ring" aria-hidden="true"><span>♫</span></div><p className="progress-caption">正在融合你的节奏与声音</p>
 <p className="progress-hint" role="status">{music.busy?'正在准备或等待音乐，请耐心等待':music.task?'已恢复任务记录，请仅查询已有任务':'尚未提交创作任务，请返回确认'}</p>
 {music.work?<><progress value={100} max={100} aria-label="音频已返回"/><p className="center">100%</p></>:<progress aria-label="音乐创作处理中，进度暂不可估计"/>}
 {music.task&&<p className="center muted">{music.task.source==='mock'?'免费模拟任务':'AI创作任务'} · {music.task.status==='unknown'?'状态未知，锁定保留':music.task.status==='rejected'?'请求已明确拒绝':music.task.status==='complete'?'已返回音频':'等待结果'}</p>}
 {music.notice&&<p role="status">{music.notice}</p>}{(music.error||music.task?.error)&&<p role="alert">{music.error||music.task?.error}</p>}
 {music.task&&!music.busy&&<ActionButton onClick={()=>void music.query()}>查询已有任务（不重新生成）</ActionButton>}
 {music.task?.status==='rejected'&&<ActionButton tone="surface" onClick={()=>void music.prepareAgain().then(ok=>{if(ok)navigate(paths.prepare);})}>确认重新准备（不生成）</ActionButton>}
 <ActionLink to={paths.prepare} tone="surface">返回编曲准备</ActionLink><ActionLink to={paths.works} tone="surface">查看我的音乐与可恢复作品</ActionLink></Page>;
}

export function Player(){
 const music=useMusic(),{sounds,setDraft}=useCreation(),navigate=useNavigate(),[params]=useSearchParams();const workId=params.get('work');
 const [loaded,setLoaded]=useState<MusicWork>(),[error,setError]=useState(''),[working,setWorking]=useState(false),[useMix,setUseMix]=useState(false),[version,setVersion]=useState<'raw'|'mix'>('raw'),[time,setTime]=useState(0),[length,setLength]=useState(0),[playing,setPlaying]=useState(false);
 const record=workId?loaded:music.work;const [local,setLocal]=useState<MusicWork>();const work=local?.id===record?.id?local:record;const audio=useRef<HTMLAudioElement>(null);
 useEffect(()=>{let active=true;setLocal(undefined);setLoaded(undefined);setUseMix(false);setVersion('raw');if(workId)void musicRepository.get(workId).then(w=>{if(active){setLoaded(w);if(!w)setError('作品未找到，请返回我的音乐');}}).catch(()=>{if(active)setError('读取作品失败，请重试');});return()=>{active=false;};},[workId]);
 const mixedSounds=useMemo(()=>work?.intent?.sounds.map(s=>sounds.find(a=>a.id===s.id)).filter((s):s is typeof sounds[number]=>!!s)??[],[work?.intent,sounds]);
 useEffect(()=>{if(record){setUseMix(!!record.preferredMix&&!!record.mixBlob);setVersion(record.preferredMix&&record.mixBlob?'mix':'raw');}},[record?.id]);
 const activeQuality=version==='mix'?work?.mixQuality:work?.quality;
 const blob=version==='mix'&&work?.mixBlob?work.mixBlob:work?.blob,url=useAudioUrl(blob),rawUrl=useAudioUrl(work?.blob),mixUrl=useAudioUrl(work?.mixBlob);
 useEffect(()=>{const element=audio.current;setPlaying(false);setTime(0);return()=>element?.pause();},[url]);
 useEffect(()=>{if(!useMix||!work?.intent||work.mixBlob)return;const control=new AbortController();setWorking(true);setError('');
  void mixUserSounds(work.blob,work.intent,mixedSounds,'low',control.signal,work.duration).then(async result=>{const quality=await inspectAudioQuality(result.blob,work.duration,control.signal);control.signal.throwIfAborted();const next={...work,mixBlob:result.blob,mixQuality:quality,mixNote:result.note,preferredMix:true};await musicRepository.put(next);control.signal.throwIfAborted();setLocal(next);setVersion('mix');}).catch(e=>{if(!control.signal.aborted){setError(`混音未完成：${e instanceof Error?e.message:'错误'}。已保留AI原曲，不会重新生成。`);setUseMix(false);}}).finally(()=>{if(!control.signal.aborted)setWorking(false);});
  return()=>control.abort();
 },[useMix,work?.id,mixedSounds]);
 async function save(){if(!work||working)return;setWorking(true);try{const saved={...work,saved:true,preferredMix:version==='mix',updatedAt:Date.now()};await musicRepository.put(saved);setLocal(saved);if(music.work?.id===saved.id)music.setWork(saved);navigate(`${paths.saved}?work=${encodeURIComponent(saved.id)}`);}catch{setError('作品保存失败，请检查本地存储空间后重试；音频仍可下载。');}finally{setWorking(false);}}
 async function recompose(){if(music.task&&music.task.id!==work?.id&&music.task.status!=='complete'){setError('另一个任务尚未核实，请先查询，不能解除未知锁');return;}if(music.task&&!await music.prepareAgain())return;if(work?.intent)setDraft(old=>({...old,rhythm:work.intent!.events,selectedSoundIds:work.intent!.sounds.map(s=>s.id),preferenceText:work.intent!.preference}));navigate(paths.prepare);}
 const fmt=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
 return <Page title="我的音乐" back={paths.works} className="player-page">{work?<><h2 className="work-title">{work.title}</h2><p className="subtitle">{sourceLabel(work.source)}</p>
 <audio ref={audio} controls src={url||undefined} aria-label="作品播放器" onLoadedMetadata={e=>setLength(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:work.duration)} onError={()=>setError('音频无法加载或解码，请下载人工检查；不会重新生成')} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}/>
 <button className="music-play" type="button" aria-label={playing?'暂停音乐':'播放音乐'} onClick={()=>{if(playing)audio.current?.pause();else void audio.current?.play().catch(()=>setError('播放未能开始，请再次点击播放或下载试听'));}}><span aria-hidden="true">{playing?'Ⅱ':'▶'}</span></button>
 <progress value={time} max={length||work.duration} aria-label="音乐播放进度"/><div className="time-labels"><span>{fmt(time)}</span><span>{fmt(length||work.duration)}</span></div>
 <p role={activeQuality?.warnings.length?'alert':'status'}>{activeQuality?activeQuality.warnings.length?`技术检查不合格：${activeQuality.warnings.join(' ')}`:`有效声音约${activeQuality.activeSeconds.toFixed(1)}秒／${activeQuality.duration.toFixed(1)}秒；未发现所检查的技术异常，音乐性请试听确认。`:'质量检查未完成，不代表作品完整。'}{music.work?.id===work.id?music.notice:''}</p>
 {activeQuality&&<p>实际时长 {activeQuality.duration.toFixed(1)}秒 · 有效声音 {activeQuality.activeSeconds.toFixed(1)}秒 · 最长近静音 {activeQuality.longestSilence.toFixed(1)}秒 · 结尾近静音 {activeQuality.trailingSilence.toFixed(1)}秒。</p>}
 {work.intent&&<Panel title="你的创作"><p>{work.intent.eventCount}次敲击 · {work.intent.sounds.map(s=>s.name).join('、')}</p><p>{work.intent.preference||'未填写额外音乐偏好'}</p></Panel>}
 <Panel title="融入自己的声音"><label><input type="checkbox" checked={useMix} className="work-mix-toggle" disabled={working||!work.intent} onChange={e=>{setUseMix(e.target.checked);if(!e.target.checked)setVersion('raw');else if(work.mixBlob)setVersion('mix');}}/>低强度混入个人声音（可关闭）</label><p>只取少量短声音点缀，未检测到可靠拍点，不保证严格对齐；不覆盖主旋律或填补原曲静音。</p>{!work.intent&&<p>此恢复或导入作品没有原始创作特征记录，保留原曲，不冒用当前草稿混音。</p>}{working&&<p role="status">正在本地处理，不调用AI</p>}{work.mixBlob&&<>{work.mixNote&&<p>{work.mixNote}</p>}{work.quality?.warnings.length&&version==='mix'?<p role="alert">原曲仍有技术告警：{work.quality.warnings.join(' ')} 降低音量不代表修复原有失真。</p>:null}<label htmlFor="work-version">试听版本</label><select id="work-version" value={version} onChange={e=>setVersion(e.target.value as 'raw'|'mix')}><option value="raw">原曲</option><option value="mix">混音版本</option></select></>}</Panel>
 <a className="action surface" href={rawUrl} download={`wanwu-${work.source==='mock'?'mock':'original'}.${work.blob.type.includes('wav')?'wav':'mp3'}`}>下载原曲</a>{mixUrl&&<a className="action surface" href={mixUrl} download={work.source==='mock'?'wanwu-mock-final-mix.wav':'wanwu-final-mix.wav'}>下载混音作品</a>}
 <ActionButton tone="surface" disabled={working||music.busy} onClick={()=>void recompose()}>不喜欢 · 重新编曲</ActionButton><ActionButton disabled={working||music.busy} onClick={()=>void save()}>保存作品</ActionButton>
 </>:<><h2 className="work-title">还没有编曲结果</h2><p className="subtitle">完成编曲后，可以在这里试听与保存</p>{music.task&&<ActionLink to={paths.composing}>恢复当前任务</ActionLink>}<ActionLink to={paths.prepare}>不喜欢 · 重新编曲</ActionLink></>}{(error||music.error)&&<p role="alert">{error||music.error}</p>}</Page>;
}
export function Works(){
 const music=useMusic(),navigate=useNavigate(),{startNewCreation}=useCreation();const [works,setWorks]=useState<MusicWork[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;void musicRepository.list().then(w=>{if(active)setWorks(w);}).catch(()=>{if(active)setError('作品列表读取失败，请重试');}).finally(()=>{if(active)setLoading(false);});void music.connect();return()=>{active=false;};},[]);
 async function restore(r:typeof music.registry[number]){const ok=await music.recover(r);if(ok)navigate(paths.composing);}
 async function importAudio(file:File){try{const blob=file,quality=await inspectAudioQuality(blob,90);const work:MusicWork={id:crypto.randomUUID(),title:file.name,source:'imported',duration:quality.duration,createdAt:Date.now(),updatedAt:Date.now(),blob,quality,saved:true};await musicRepository.put(work);navigate(`${paths.player}?work=${work.id}`);}catch{setError('无法导入或保存该音频，请确认可解码且本地存储空间充足');}}
 return <Page title="我制作的音乐" back={paths.mine} className="works-page">{loading?<p role="status">正在读取作品</p>:works.length?<ul className="sound-list">{works.map(w=><li key={w.id}><div><strong>{w.title}</strong><p>{sourceLabel(w.source)} · {new Date(w.createdAt).toLocaleString('zh-CN')}</p><ActionLink to={`${paths.player}?work=${encodeURIComponent(w.id)}`} tone="surface">试听作品 · {w.title}</ActionLink></div></li>)}</ul>:<div className="empty-content"><span className="empty-symbol" aria-hidden="true">♫</span><h2>还没有保存的音乐</h2><p>从自己的节奏开始，制作第一首作品</p></div>}
 <ActionButton disabled={music.busy} onClick={async()=>{if(music.task?.status==='complete'&&!await music.prepareAgain())return;startNewCreation();navigate(paths.rhythm);}}>开始创作 →</ActionButton>
 {music.task&&<ActionLink to={music.task.status==='complete'?paths.player:paths.composing} tone="surface">查看当前创作任务</ActionLink>}
 <details><summary>恢复已有生成作品（仅查询，不重新生成）</summary><p>复用服务已有结果，不消耗新的生成额度；其他模式的任务可能需要切回对应服务。</p>{music.registry.filter(r=>r.status==='complete').map(r=><ActionButton key={r.id} tone="surface" disabled={music.busy||!!music.task||r.requiresModeSwitch} onClick={()=>void restore(r)}>恢复{r.executionMode==='mock'?'模拟':'AI'}作品 · {r.createdAt?new Date(r.createdAt).toLocaleString('zh-CN'):r.id.slice(0,8)} · {r.duration??90}秒</ActionButton>)}<ActionButton tone="surface" onClick={()=>void music.connect()}>刷新已有作品</ActionButton></details>
 <label htmlFor="import-work">导入已下载音频（仅本地，不调用AI）</label><input id="import-work" type="file" accept="audio/*" onChange={e=>{const file=e.target.files?.[0];if(file)void importAudio(file);e.target.value='';}}/>
 {(error||music.error)&&<p role="alert">{error||music.error}</p>}</Page>;
}
export function Saved(){
 const [params]=useSearchParams(),[verified,setVerified]=useState(false),[error,setError]=useState('');const id=params.get('work');useEffect(()=>{let active=true;if(id)void musicRepository.get(id).then(w=>{if(active)setVerified(!!w?.saved);}).catch(()=>{if(active)setError('无法核实保存记录，请在我的音乐中检查');});return()=>{active=false;};},[id]);
 return <Page title={verified?'保存成功':'保存结果'} back={id?`${paths.player}?work=${encodeURIComponent(id)}`:paths.player} className="saved-page"><div className="success-symbol" aria-hidden="true">{verified?'✓':'♫'}</div><div className="center" role="status"><h2>{verified?'作品已保存':'尚未确认作品保存'}</h2><p className="muted">{verified?'可以在「我制作的音乐」中找到':'请先从作品页面完成保存'}</p></div>{error&&<p role="alert">{error}</p>}<ActionLink to={paths.works}>查看我的音乐 →</ActionLink></Page>;
}
