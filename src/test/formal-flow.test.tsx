import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import {App} from '../app/App';
import {musicRepository,type MusicWork} from '../services/storage/music';
import {soundRepository} from '../services/storage/sounds';
import {inspectAudioQuality} from '../services/composition/quality';
import {getLabConfig,getJobRegistry,getLocalTaskStatus,submitAudio,fetchAudioResult,LabRequestError} from '../services/composition/audioLabClient';
import {ACTIVE_MUSIC_KEY} from '../services/composition/formalTask';
import {DRAFT_KEY} from '../services/storage/draft';
import {builtinSounds} from '../services/sounds/catalog';
import {RhythmAudio} from '../services/audio/RhythmAudio';
import {soundPlayer} from '../services/audio/SoundPlayer';
vi.mock('../services/storage/music',()=>({musicRepository:{get:vi.fn(),put:vi.fn(),list:vi.fn()}}));
vi.mock('../services/composition/quality',async original=>({...await original<typeof import('../services/composition/quality')>(),inspectAudioQuality:vi.fn()}));
vi.mock('../services/composition/audioLabClient',async original=>({...await original<typeof import('../services/composition/audioLabClient')>(),getLabConfig:vi.fn(),getJobRegistry:vi.fn(),getLocalTaskStatus:vi.fn(),submitAudio:vi.fn(),fetchAudioResult:vi.fn()}));
let records:Map<string,MusicWork>;
const quality={duration:90,expectedDuration:90,activeSeconds:89,longestSilence:1,trailingSilence:1,windows:[],warnings:[],passed:true};
function page(path='/'){return render(<MemoryRouter initialEntries={[path]}><App/></MemoryRouter>);}
function draft(events=[0,420,610,1200]){const rhythm=events.map((time,i)=>({id:`user-${i}`,time,duration:40,velocity:.4+i*.1,source:'touch'}));localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,sessionId:'formal-user-session',draft:{rhythm,selectedSoundIds:[builtinSounds[1].id],preferenceText:'轻快的钢琴'},group:builtinSounds.slice(0,6).map(s=>s.id),cardIndex:0}));return rhythm;}
beforeEach(()=>{
 localStorage.clear();records=new Map();vi.mocked(musicRepository.get).mockImplementation(async id=>records.get(id));vi.mocked(musicRepository.put).mockImplementation(async work=>{records.set(work.id,{...work});});vi.mocked(musicRepository.list).mockImplementation(async()=>[...records.values()].filter(w=>w.saved));
 vi.spyOn(soundRepository,'list').mockResolvedValue([]);vi.spyOn(RhythmAudio.prototype,'tap').mockResolvedValue();vi.spyOn(RhythmAudio.prototype,'play').mockResolvedValue();vi.spyOn(soundPlayer,'toggle').mockResolvedValue();
 vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'fake-local-token',model:'stable-audio-3',duration:90,generationModes:['text-to-audio'],uiProtocol:2});vi.mocked(getJobRegistry).mockResolvedValue({journalHealthy:true,records:[]});vi.mocked(getLocalTaskStatus).mockResolvedValue({state:'pending',canPrepare:false,executionMode:'live',duration:90});vi.mocked(submitAudio).mockResolvedValue({status:'pending'});vi.mocked(fetchAudioResult).mockResolvedValue(new Blob(['fake response fixture'],{type:'audio/mpeg'}));vi.mocked(inspectAudioQuality).mockResolvedValue(quality);
 vi.stubGlobal('URL',class extends URL{static createObjectURL=vi.fn(()=>'blob:formal-test');static revokeObjectURL=vi.fn();});vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();});
describe('正式APP：免费端到端与付费安全（无真实API）',()=>{
 it('首页选声音→键盘敲击→试听→免费体验→结果→真实Blob保存→刷新读取作品',async()=>{
  const view=page();const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'先选择声音，再敲击节奏'}));
  const preview=screen.getByRole('button',{name:/^试听/});await user.click(preview);expect(soundPlayer.toggle).toHaveBeenCalledOnce();await user.click(screen.getByRole('button',{name:'喜欢'}));const selected=JSON.parse(localStorage.getItem(DRAFT_KEY)!).draft.selectedSoundIds;
  await user.click(screen.getByRole('button',{name:'下一步 →'}));const pad=screen.getByRole('button',{name:'轻触演奏，敲击录制节奏'});pad.focus();await user.keyboard(' ');await user.keyboard('{Enter}');const input=JSON.parse(localStorage.getItem(DRAFT_KEY)!).draft.rhythm;expect(input).toHaveLength(2);expect(input[0].time).toBe(0);
  await user.click(screen.getByRole('button',{name:'试听节奏'}));expect(RhythmAudio.prototype.play).toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'下一步 →'}));await screen.findByText(/真实AI创作：预计/);
  await user.click(screen.getByRole('checkbox',{name:'免费体验完整流程（本地模拟，不调用AI）'}));await user.click(screen.getByRole('button',{name:'开始编曲 →'}));await screen.findByRole('heading',{name:'免费体验作品（模拟）'});
  await waitFor(()=>expect(screen.getByRole('button',{name:'保存作品'})).toBeEnabled());expect(submitAudio).not.toHaveBeenCalled();expect(fetchAudioResult).not.toHaveBeenCalled();const work=[...records.values()][0];expect(work.intent?.events).toEqual(input);expect(work.intent?.sounds.map(s=>s.id)).toEqual(selected);expect(work.prompt).toContain('independent');expect(work.source).toBe('mock');expect(work.blob.size).toBeGreaterThan(1_000_000);
  expect(screen.getByRole('link',{name:'下载原曲'})).toHaveAttribute('download','wanwu-mock.wav');await user.click(screen.getByRole('button',{name:'保存作品'}));await screen.findByText('作品已保存');expect(records.get(work.id)?.saved).toBe(true);
  view.unmount();page('/music');await screen.findByRole('link',{name:'试听作品 · 免费体验作品（模拟）'});expect(submitAudio).not.toHaveBeenCalled();
 });
 it('正式Live逻辑复用共享客户端，仅当次确认后一次TTA请求，传真实草稿而非参考WAV',async()=>{
  const rhythm=draft();page('/compose');const user=userEvent.setup();await screen.findByText(/真实AI创作：预计/);await user.click(screen.getByRole('button',{name:'开始编曲 →'}));expect(submitAudio).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent('勾选本次生成费用');
  await user.click(screen.getByRole('checkbox',{name:/我确认本次90秒AI创作/}));await user.dblClick(screen.getByRole('button',{name:'开始编曲 →'}));await screen.findByRole('heading',{name:'我的AI音乐'});expect(submitAudio).toHaveBeenCalledOnce();const args=vi.mocked(submitAudio).mock.calls[0];expect(args[2]).toBeUndefined();expect(args[5]).toBe(true);expect(args[7]).toBe(90);expect(args[9]).toBe('text-to-audio');expect([...records.values()][0].intent?.events).toEqual(rhythm);
 });
 it('缺少节奏或声音时不能生成，返回修改仍保存已选素材和偏好',async()=>{
  draft([]);page('/compose');const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'开始编曲 →'}));expect(screen.getByRole('alert')).toHaveTextContent('先录制节奏');expect(submitAudio).not.toHaveBeenCalled();await user.click(screen.getByRole('link',{name:'修改节奏'}));const pad=screen.getByRole('button',{name:'轻触演奏，敲击录制节奏'});pad.focus();await user.keyboard('{Enter}');await user.click(screen.getByRole('button',{name:'下一步 →'}));expect(screen.getByRole('textbox',{name:'你希望音乐是什么感觉？'})).toHaveValue('轻快的钢琴');expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).draft.selectedSoundIds).toEqual([builtinSounds[1].id]);
 });
 it('网络提交结果未知保持全局锁，刷新不重发，只允许显式查询已有任务',async()=>{
  draft();vi.mocked(submitAudio).mockRejectedValue(new LabRequestError('提交连接中断','upload',{submissionUnknown:true,code:'SUBMISSION_UNCERTAIN'}));const view=page('/compose');const user=userEvent.setup();await screen.findByText(/真实AI创作：预计/);await user.click(screen.getByRole('checkbox',{name:/我确认本次90秒AI创作/}));await user.click(screen.getByRole('button',{name:'开始编曲 →'}));await screen.findByRole('button',{name:'查询已有任务（不重新生成）'});await waitFor(()=>expect(JSON.parse(localStorage.getItem(ACTIVE_MUSIC_KEY)!).status).toBe('unknown'));const id=JSON.parse(localStorage.getItem(ACTIVE_MUSIC_KEY)!).id;
  view.unmount();page('/compose/progress');expect(submitAudio).toHaveBeenCalledOnce();expect(fetchAudioResult).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'查询已有任务（不重新生成）'}));await screen.findByRole('heading',{name:'我的AI音乐'});expect(submitAudio).toHaveBeenCalledOnce();expect(fetchAudioResult).toHaveBeenCalledWith(expect.anything(),id,expect.any(AbortSignal));
 });
 it('90秒仅30秒有效声音明确不合格，保存失败不跳转，不自动再生成',async()=>{
  draft();vi.mocked(inspectAudioQuality).mockResolvedValue({...quality,activeSeconds:30,longestSilence:60,trailingSilence:60,passed:false,warnings:['后60秒近静音，作品可能不完整']});page('/compose');const user=userEvent.setup();await user.click(screen.getByRole('checkbox',{name:'免费体验完整流程（本地模拟，不调用AI）'}));await user.click(screen.getByRole('button',{name:'开始编曲 →'}));await screen.findByText(/技术检查不合格/);await waitFor(()=>expect(screen.getByRole('button',{name:'保存作品'})).toBeEnabled());vi.mocked(musicRepository.put).mockRejectedValue(Error('quota'));await user.click(screen.getByRole('button',{name:'保存作品'}));await screen.findByText(/作品保存失败/);expect(screen.getByRole('heading',{level:1})).toHaveTextContent('我的音乐');expect(submitAudio).not.toHaveBeenCalled();
 });
});

it('没有选择声音时明确阻止生成，所有主要按钮有名称且键盘可确认免费体验',async()=>{
 draft();const data=JSON.parse(localStorage.getItem(DRAFT_KEY)!);data.draft.selectedSoundIds=[];localStorage.setItem(DRAFT_KEY,JSON.stringify(data));page('/compose');const user=userEvent.setup();
 for(const button of screen.getByRole('main').querySelectorAll('button,a,input'))expect(button).toHaveAccessibleName();await user.click(screen.getByRole('button',{name:'开始编曲 →'}));expect(screen.getByRole('alert')).toHaveTextContent('选择至少一个');expect(submitAudio).not.toHaveBeenCalled();
 const free=screen.getByRole('checkbox',{name:'免费体验完整流程（本地模拟，不调用AI）'});free.focus();await user.keyboard(' ');expect(free).toBeChecked();
});

it('服务在确认后切换模式时不提交也不创建任务锁',async()=>{
 draft();page('/compose');const user=userEvent.setup();await screen.findByText(/真实AI创作：预计/);vi.mocked(getLabConfig).mockResolvedValueOnce({mode:'mock',token:'different',model:'stable-audio-3',duration:90,generationModes:['text-to-audio']});
 await user.click(screen.getByRole('checkbox',{name:/我确认本次90秒AI创作/}));await user.click(screen.getByRole('button',{name:'开始编曲 →'}));await screen.findByText(/服务模式已变化/);expect(submitAudio).not.toHaveBeenCalled();expect(localStorage.getItem(ACTIVE_MUSIC_KEY)).toBeNull();
});

it('提交前不能持久保存任务ID时不调用付费服务',async()=>{
 draft();page('/compose');const user=userEvent.setup();await screen.findByText(/真实AI创作：预计/);const original=Storage.prototype.setItem;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){if(key===ACTIVE_MUSIC_KEY)throw new DOMException('quota','QuotaExceededError');original.call(this,key,value);});
 await user.click(screen.getByRole('checkbox',{name:/我确认本次90秒AI创作/}));await user.click(screen.getByRole('button',{name:'开始编曲 →'}));await screen.findByText(/任务记录保存失败/);expect(submitAudio).not.toHaveBeenCalled();expect(localStorage.getItem(ACTIVE_MUSIC_KEY)).toBeNull();
});

it('主要正式流程可用键盘激活，不需要滑动或鼠标敲击',async()=>{
 page();const user=userEvent.setup();async function activate(control:HTMLElement){control.focus();expect(control).toHaveFocus();await user.keyboard('{Enter}');}
 await activate(screen.getByRole('button',{name:'先选择声音，再敲击节奏'}));await activate(screen.getByRole('button',{name:'喜欢'}));await activate(screen.getByRole('button',{name:'下一步 →'}));
 const pad=screen.getByRole('button',{name:'轻触演奏，敲击录制节奏'});pad.focus();await user.keyboard(' ');await user.keyboard('{Enter}');await activate(screen.getByRole('button',{name:'下一步 →'}));
 const free=screen.getByRole('checkbox',{name:'免费体验完整流程（本地模拟，不调用AI）'});free.focus();await user.keyboard(' ');await activate(screen.getByRole('button',{name:'开始编曲 →'}));await screen.findByRole('heading',{name:'免费体验作品（模拟）'});
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存作品'})).toBeEnabled());await activate(screen.getByRole('button',{name:'保存作品'}));await screen.findByText('作品已保存');await activate(screen.getByRole('link',{name:'查看我的音乐 →'}));await screen.findByRole('link',{name:'试听作品 · 免费体验作品（模拟）'});expect(submitAudio).not.toHaveBeenCalled();
});
