import * as qualityService from '../services/composition/quality';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import {CreationProvider} from '../app/CreationContext';
import AudioLab from '../pages/AudioLab';
import {DRAFT_KEY} from '../services/storage/draft';
import {builtinSounds} from '../services/sounds/catalog';
import {getJobRegistry,archiveLegacyTask,getLabConfig,submitAudio,fetchAudioResult,prepareRejectedTest,getLocalTaskStatus,LabRequestError} from '../services/composition/audioLabClient';
import {renderReference} from '../services/composition/reference';
import {loadLabReference,saveLabReference} from '../services/storage/labReference';
import {soundRepository} from '../services/storage/sounds';
vi.mock('../services/composition/audioLabClient',async(importOriginal)=>({...await importOriginal<typeof import('../services/composition/audioLabClient')>(),getJobRegistry:vi.fn(),archiveLegacyTask:vi.fn(),getLabConfig:vi.fn(),submitAudio:vi.fn(),fetchAudioResult:vi.fn(),prepareRejectedTest:vi.fn(),getLocalTaskStatus:vi.fn()}));
vi.mock('../services/storage/labReference',()=>({loadLabReference:vi.fn(),saveLabReference:vi.fn()}));
vi.mock('../services/composition/reference',()=>({renderReference:vi.fn()}));
function page(){return render(<MemoryRouter initialEntries={['/dev/audio-lab']}><CreationProvider><AudioLab/></CreationProvider></MemoryRouter>);}
beforeEach(()=>{
  sessionStorage.clear();
  sessionStorage.setItem('wanwu:audio-lab:lab-session:state',JSON.stringify({version:1,generationMode:'audio-to-audio',strength:.6,duration:30,scenario:'success'}));
  vi.mocked(getJobRegistry).mockResolvedValue({journalHealthy:true,records:[]});
  vi.mocked(archiveLegacyTask).mockResolvedValue({archived:true,outcome:'unknown'});
  localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,sessionId:'lab-session',draft:{rhythm:[{id:'hit',time:0,duration:30,velocity:.6,source:'mouse'}],selectedSoundIds:[builtinSounds[0].id],preferenceText:'安静'},group:builtinSounds.slice(0,6).map(sound=>sound.id),cardIndex:0}));
  vi.mocked(getLabConfig).mockResolvedValue({mode:'mock',token:'local-token',model:'stable-audio-3',duration:30,uiProtocol:2});
  vi.mocked(loadLabReference).mockResolvedValue(undefined);vi.mocked(saveLabReference).mockResolvedValue();
  vi.mocked(getLocalTaskStatus).mockResolvedValue({state:'pending',canPrepare:false});
  vi.mocked(renderReference).mockResolvedValue(new Blob(['wav'],{type:'audio/wav'}));
  vi.mocked(prepareRejectedTest).mockResolvedValue({prepared:true,previousStateVerified:true,message:'已核实参数拒绝'});
  vi.mocked(submitAudio).mockResolvedValue({status:'complete'});vi.mocked(fetchAudioResult).mockResolvedValue(new Blob(['result'],{type:'audio/wav'}));
  vi.spyOn(soundRepository,'list').mockResolvedValue([]);
  vi.stubGlobal('URL',class extends URL{static createObjectURL=vi.fn(()=>'blob:lab');static revokeObjectURL=vi.fn();});
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();sessionStorage.clear();});
describe('实验室费用控制交互',()=>{
  it('只由点击提交，Mock标注结果；刷新后不重发，只可查询已有任务',async()=>{
    const view=page();const user=userEvent.setup();await screen.findByText(/Mock模式/);
    expect(submitAudio).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'制作30秒参考音频'}));
    await user.dblClick(screen.getByRole('button',{name:'测试 AI 编曲（Mock）'}));
    await screen.findByRole('heading',{name:'Mock返回音频（与参考相同）'});expect(submitAudio).toHaveBeenCalledOnce();
    expect(renderReference).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({time:0})]),expect.arrayContaining([expect.objectContaining({id:builtinSounds[0].id})]),expect.any(AbortSignal));
    view.unmount();page();await screen.findByText(/Mock模式/);
    expect(submitAudio).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'测试 AI 编曲（Mock）'})).toBeDisabled();
    await user.click(screen.getByRole('button',{name:'仅查询已有任务'}));await screen.findByRole('heading',{name:'Mock返回音频（与参考相同）'});
    expect(submitAudio).toHaveBeenCalledOnce();
  });
  it('400后手动重新准备保留Prompt和参考音频，不重发，重新生成必须再次确认',async()=>{
    vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'local-token',model:'stable-audio-3',duration:30,uiProtocol:2});
    vi.mocked(submitAudio).mockRejectedValue(new LabRequestError('bad_request · prompt: required','upload',{httpStatus:400,code:'UPSTREAM_400'}));
    page();const user=userEvent.setup();await screen.findByText(/真实付费模式/);
    await user.click(screen.getByRole('button',{name:'制作30秒参考音频'}));
    const prompt=(screen.getByRole('textbox',{name:'英文音乐描述（可编辑）'}) as HTMLTextAreaElement).value;
    await user.click(screen.getByRole('checkbox',{name:/我确认本次请求生成/}));await user.click(screen.getByRole('button',{name:'测试 AI 编曲'}));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button',{name:'重新准备测试（不生成）'}));
    expect(screen.getByRole('button',{name:'确认重新准备（不调用AI）'})).toBeDisabled();
    await user.click(screen.getByRole('checkbox',{name:/我确认上次请求/}));
    await user.click(screen.getByRole('button',{name:'确认重新准备（不调用AI）'}));
    await screen.findByText(/已重新准备：参考音频/);
    expect(prepareRejectedTest).toHaveBeenCalledOnce();expect(submitAudio).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox',{name:'英文音乐描述（可编辑）'})).toHaveValue(prompt);
    expect(screen.getByRole('link',{name:'下载参考 WAV'})).toHaveAttribute('href','blob:lab');
    expect(screen.getByRole('button',{name:'测试 AI 编曲'})).toBeDisabled();
  });
  it('刷新恢复400错误、Prompt参数和参考缓存；核实拒绝后入口可见，不自动请求AI',async()=>{
    vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'new-token',model:'stable-audio-3',duration:30,uiProtocol:2});
    vi.mocked(submitAudio).mockRejectedValue(new LabRequestError('bad_request · prompt: required','upload',{httpStatus:400,code:'UPSTREAM_400'}));
    const blob=new Blob(['preserved-reference'],{type:'audio/wav'});vi.mocked(renderReference).mockResolvedValue(blob);
    const view=page();const user=userEvent.setup();await screen.findByText(/真实付费模式/);
    await user.click(screen.getByRole('button',{name:'制作30秒参考音频'}));
    fireEvent.change(screen.getByRole('textbox',{name:'英文音乐描述（可编辑）'}),{target:{value:'My unchanged custom melody prompt'}});
    await user.selectOptions(screen.getByLabelText('目标作品时长（参考音频保持30秒）'),'120');
    await user.click(screen.getByRole('checkbox',{name:/我确认本次请求生成/}));await user.click(screen.getByRole('button',{name:'测试 AI 编曲'}));await screen.findByRole('alert');
    const record=JSON.parse(sessionStorage.getItem('wanwu:audio-lab:lab-session:state')!);
    expect(record.task.state).toBe('rejected');expect(record.task.error).toContain('prompt: required');
    view.unmount();vi.mocked(loadLabReference).mockResolvedValue(blob);vi.mocked(getLocalTaskStatus).mockResolvedValue({state:'rejected',canPrepare:true,error:'HTTP400 prompt: required'});
    page();await waitFor(()=>expect(screen.getByRole('button',{name:'重新准备测试（不生成）'})).toBeEnabled());
    expect(screen.getByText(/上次任务记录：HTTP400/)).toBeVisible();expect(screen.getByRole('textbox',{name:'英文音乐描述（可编辑）'})).toHaveValue('My unchanged custom melody prompt');
    expect(screen.getByLabelText('目标作品时长（参考音频保持30秒）')).toHaveValue('120');
    expect(await screen.findByRole('link',{name:'下载参考 WAV'})).toBeVisible();
    expect(screen.getByRole('checkbox',{name:/我确认本次请求生成/})).not.toBeChecked();expect(screen.getByText(/尚未勾选本次真实付费确认/)).toBeVisible();
    expect(submitAudio).toHaveBeenCalledOnce();expect(fetchAudioResult).not.toHaveBeenCalled();
  });
  it('旧版仅ID锁迁移后可见，后端重启未知不可直接清除，明确显示原因',async()=>{
    sessionStorage.setItem('wanwu:audio-lab:lab-session','legacy-request-123456789');
    vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'new-token',model:'stable-audio-3',duration:30,uiProtocol:2});
    vi.mocked(getLocalTaskStatus).mockResolvedValue({state:'unknown',canPrepare:false,error:'后端已重启，无法确认生成或计费'});
    page();await screen.findByText(/上次任务记录：后端已重启/);
    expect(screen.getByRole('button',{name:'重新准备测试（不生成）'})).toBeVisible();expect(screen.getByRole('button',{name:'重新准备测试（不生成）'})).toBeDisabled();
    expect(screen.getByText(/存在任务锁：状态未知/)).toBeVisible();expect(screen.getByText(/请核对Stability账户任务/)).toBeVisible();
    expect(prepareRejectedTest).not.toHaveBeenCalled();expect(submitAudio).not.toHaveBeenCalled();expect(fetchAudioResult).not.toHaveBeenCalled();
  });
  it.each(['pending','submitting','error'] as const)('本地任务%s保持锁定，重新准备入口可见但不能执行',async(state)=>{
    sessionStorage.setItem('wanwu:audio-lab:lab-session','pending-request-123456789');
    vi.mocked(getLocalTaskStatus).mockResolvedValue({state,canPrepare:false,error:'状态不能证明未计费'});
    page();await screen.findByText(/上次任务记录：状态不能证明未计费/);
    expect(screen.getByRole('button',{name:'重新准备测试（不生成）'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'测试 AI 编曲（Mock）'})).toBeDisabled();expect(submitAudio).not.toHaveBeenCalled();expect(fetchAudioResult).not.toHaveBeenCalled();
  });
  it('后端版本过旧显示升级指引，不隐藏禁用原因或误认为Live就绪',async()=>{
    vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'old-token',model:'stable-audio-3',duration:30});
    page();expect(await screen.findByRole('alert')).toHaveTextContent('后端版本过旧');
    expect(screen.getByText(/付费确认暂不可用/)).toBeVisible();expect(screen.getByRole('button',{name:'重新准备测试（不生成）'})).toBeVisible();
    expect(screen.getByRole('button',{name:'测试 AI 编曲'})).toHaveAccessibleDescription(/后端未连接或版本不匹配/);
    expect(submitAudio).not.toHaveBeenCalled();
  });
  it('没有任务但未确认付费也明确解释禁用，制作参考不代表可生成',async()=>{
    vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'local-token',model:'stable-audio-3',duration:30,uiProtocol:2});
    page();const user=userEvent.setup();await screen.findByText(/真实付费模式/);await user.click(screen.getByRole('button',{name:'制作30秒参考音频'}));
    expect(screen.getByText(/没有本轮任务锁/)).toBeVisible();expect(screen.getByRole('button',{name:'重新准备测试（不生成）'})).toBeEnabled();
    expect(screen.getByRole('button',{name:'测试 AI 编曲'})).toHaveAccessibleDescription(/尚未勾选本次真实付费确认/);
    await user.click(screen.getByRole('button',{name:'重新准备测试（不生成）'}));
    expect(prepareRejectedTest).not.toHaveBeenCalled();expect(submitAudio).not.toHaveBeenCalled();
  });
  it('选择90秒显示专用Prompt与真实费用，取消旧确认，仅主动确认后提交90秒',async()=>{
    vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'token',model:'stable-audio-3',duration:30,uiProtocol:2,allowedDurations:[30,90,120,180,240],pricing:{credits:8,usd:.08,checkedAt:'2026-11-02',basis:'per-successful-generation'}});
    const blob=new Blob(['same-thirty-second-reference'],{type:'audio/wav'});vi.mocked(renderReference).mockResolvedValue(blob);
    page();const user=userEvent.setup();await screen.findByText(/真实付费模式/);
    await user.click(screen.getByRole('button',{name:'制作30秒参考音频'}));
    fireEvent.change(screen.getByRole('textbox',{name:'英文音乐描述（可编辑）'}),{target:{value:'Keep my glass texture and personal rhythm.'}});
    await user.click(screen.getByRole('checkbox',{name:/我确认本次请求生成/}));
    await user.selectOptions(screen.getByLabelText('目标作品时长（参考音频保持30秒）'),'90');
    expect(screen.getByRole('option',{name:'90 秒 · 完整编曲测试'})).toBeInTheDocument();
    expect(screen.getByRole('checkbox',{name:/我确认本次请求生成/})).not.toBeChecked();expect(screen.getByRole('button',{name:'测试 AI 编曲'})).toBeDisabled();
    expect(screen.getByText(/预计计费：8 credits／成功生成/)).toHaveTextContent('US$0.08');
    expect((screen.getByRole('textbox',{name:'实际发送的完整Prompt（只读预览）'}) as HTMLTextAreaElement).value).toContain('Keep my glass texture');
    expect(submitAudio).not.toHaveBeenCalled();expect(renderReference).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('checkbox',{name:/我确认本次请求生成/}));await user.click(screen.getByRole('button',{name:'测试 AI 编曲'}));
    await screen.findByRole('heading',{name:'AI返回音乐'});
    const call=vi.mocked(submitAudio).mock.calls[0];expect(call[2]).toBe(blob);expect(call[3]).toContain('complete 90-second instrumental');expect(call[5]).toBe(true);expect(call[7]).toBe(90);
    expect(screen.getByRole('checkbox',{name:/我确认本次请求生成/})).not.toBeChecked();expect(submitAudio).toHaveBeenCalledOnce();
  });
  it('Live必须勾选本次确认；提交失败不自动重试',async()=>{
    vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'local-token',model:'stable-audio-3',duration:30,uiProtocol:2});
    vi.mocked(submitAudio).mockRejectedValue(new Error('测试网络错误'));
    page();const user=userEvent.setup();await screen.findByText(/真实付费模式/);
    await user.click(screen.getByRole('button',{name:'制作30秒参考音频'}));
    expect(screen.getByRole('button',{name:'测试 AI 编曲'})).toBeDisabled();
    await user.click(screen.getByRole('checkbox',{name:/我确认本次请求生成/}));
    await user.click(screen.getByRole('button',{name:'测试 AI 编曲'}));
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('不会自动重新提交'));
    expect(submitAudio).toHaveBeenCalledOnce();expect(fetchAudioResult).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'测试 AI 编曲'})).toBeDisabled();
  });
});

it('未知提交显示本地超时证据并保持锁定，刷新与余额信息不触发生成',async()=>{
  sessionStorage.setItem('wanwu:audio-lab:lab-session','request-1234567890123456');
  vi.mocked(getLocalTaskStatus).mockResolvedValue({state:'error',canPrepare:false,outcome:'unknown',error:'SUBMISSION_UNCERTAIN',diagnostic:{source:'local-transport',cause:'LOCAL_SUBMIT_TIMEOUT',elapsedMs:90001,timeoutMs:90000}});
  page();await screen.findByText(/原因代码 LOCAL_SUBMIT_TIMEOUT/);
  expect(screen.getByText(/余额未变化不能用于解锁/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'重新准备测试（不生成）'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'测试 AI 编曲（Mock）'})).toBeDisabled();
  expect(submitAudio).not.toHaveBeenCalled();expect(fetchAudioResult).not.toHaveBeenCalled();
});

it('90秒新默认和低中高选项影响实际Prompt，变更取消付费确认，刷新保留选项',async()=>{
  vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'local-token',model:'stable-audio-3',duration:30,uiProtocol:2});
  const view=page();const user=userEvent.setup();await screen.findByText(/真实付费模式/);
  await user.selectOptions(screen.getByLabelText('目标作品时长（参考音频保持30秒）'),'90');
  await user.click(screen.getByRole('button',{name:'使用新版90秒默认描述'}));
  expect((screen.getByLabelText('英文音乐描述（可编辑）') as HTMLTextAreaElement).value).toContain('Compose a beautiful, complete');
  expect(screen.getByLabelText('参考素材保留程度')).toHaveValue('low');
  await user.click(screen.getByRole('checkbox',{name:/我确认本次请求生成/}));
  await user.selectOptions(screen.getByLabelText('参考素材保留程度'),'high');
  expect(screen.getByRole('checkbox',{name:/我确认本次请求生成/})).not.toBeChecked();
  expect((screen.getByLabelText('实际发送的完整Prompt（只读预览）') as HTMLTextAreaElement).value).toContain('Reference influence: high');
  view.unmount();page();await screen.findByText(/真实付费模式/);
  expect(screen.getByLabelText('参考素材保留程度')).toHaveValue('high');
  expect(submitAudio).not.toHaveBeenCalled();expect(fetchAudioResult).not.toHaveBeenCalled();
});

it('生成成功后长静音显示质量警告且下载保留，绝不自动重试',async()=>{
  vi.spyOn(qualityService,'inspectAudioQuality').mockResolvedValue({duration:90,expectedDuration:90,activeSeconds:30,longestSilence:60,trailingSilence:60,windows:[],warnings:['检测到连续60秒近静音，作品可能不完整。']});
  page();const user=userEvent.setup();await screen.findByText(/Mock模式/);
  await user.click(screen.getByRole('button',{name:'制作30秒参考音频'}));
  await user.click(screen.getByRole('button',{name:'测试 AI 编曲（Mock）'}));
  await screen.findByText(/质量警告：任务返回音频不等于作品完整/);
  expect(screen.getByRole('link',{name:'下载测试音频'})).toBeVisible();
  expect(submitAudio).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'测试 AI 编曲（Mock）'})).toBeDisabled();
});

it('旧记录人工恢复必须逐项确认并先保存审计，保留参考Prompt和90秒且取消付费确认',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 sessionStorage.setItem('wanwu:audio-lab:lab-session',id);
 sessionStorage.setItem('wanwu:audio-lab:lab-session:state',JSON.stringify({version:1,prompt:'My existing music prompt',duration:90,strength:.6,scenario:'success',retention:'low',task:{id,state:'unknown',canPrepare:false}}));
 vi.mocked(loadLabReference).mockResolvedValue(new Blob(['unchanged-reference'],{type:'audio/wav'}));
 vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'local-token',model:'stable-audio-3',duration:30,uiProtocol:2});
 vi.mocked(getLocalTaskStatus).mockResolvedValue({state:'unknown',canPrepare:false,canManualRecover:true});
 page();const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'旧版记录丢失：人工恢复说明'}));
 const archive=screen.getByRole('button',{name:'保存审计并人工归档（不生成）'});expect(archive).toBeDisabled();
 expect(archiveLegacyTask).not.toHaveBeenCalled();expect(submitAudio).not.toHaveBeenCalled();
 await user.click(screen.getByRole('checkbox',{name:/我已核对Stability账户/}));
 await user.click(screen.getByRole('checkbox',{name:/我已核对原始错误/}));
 await user.click(screen.getByRole('checkbox',{name:/我理解状态仍未知/}));
 fireEvent.change(screen.getByLabelText('输入完整旧任务ID'),{target:{value:id}});
 fireEvent.change(screen.getByLabelText('核查说明（20–1000字，不填写密钥）'),{target:{value:'已核查账户、账单与原始错误，没有上游任务ID，理解旧状态仍未知和重复计费风险。'}});
 await user.click(archive);await screen.findByText(/旧任务已按显式人工核查登记审计并归档/);
 expect(archiveLegacyTask).toHaveBeenCalledOnce();expect(sessionStorage.getItem('wanwu:audio-lab:lab-session')).toBeNull();
 expect(screen.getByLabelText('英文音乐描述（可编辑）')).toHaveValue('My existing music prompt');expect(screen.getByLabelText('目标作品时长（参考音频保持30秒）')).toHaveValue('90');
 expect(screen.getByRole('link',{name:'下载参考 WAV'})).toBeVisible();expect(screen.getByRole('checkbox',{name:/我确认本次请求生成/})).not.toBeChecked();expect(screen.getByRole('button',{name:'测试 AI 编曲'})).toBeDisabled();
 expect(submitAudio).not.toHaveBeenCalled();expect(fetchAudioResult).not.toHaveBeenCalled();
});

it('其他任务清单不自动查询上游，仅点击后GET恢复音频而不清除当前未知锁',async()=>{
 const id='11111111-1111-4111-8111-111111111111',other='other-record-123456789';sessionStorage.setItem('wanwu:audio-lab:lab-session',id);
 vi.mocked(getJobRegistry).mockResolvedValue({journalHealthy:true,records:[{id:other,status:'pending',upstreamId:'a'.repeat(64),blocksSubmission:true,duration:90}]});
 page();const user=userEvent.setup();await screen.findByText(/后端还有1条运行中或未核实/);
 expect(fetchAudioResult).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:`仅查询记录 ${other}`}));
 await screen.findByRole('link',{name:'下载此记录音频'});expect(fetchAudioResult).toHaveBeenCalledWith(expect.any(Object),other);
 expect(sessionStorage.getItem('wanwu:audio-lab:lab-session')).toBe(id);expect(archiveLegacyTask).not.toHaveBeenCalled();expect(submitAudio).not.toHaveBeenCalled();
});

it('新会话默认Text-to-Audio与90秒，无参考文件可提交Mock；本地混音可关闭且不调用生成',async()=>{
 sessionStorage.clear();vi.mocked(getLabConfig).mockResolvedValue({mode:'mock',token:'local-token',model:'stable-audio-3',duration:30,uiProtocol:2,generationModes:['text-to-audio','audio-to-audio']});
 page();const user=userEvent.setup();await screen.findByText(/Mock模式/);
 expect(screen.getByLabelText('音乐生成模式')).toHaveValue('text-to-audio');expect(screen.getByLabelText('目标作品时长（参考音频保持30秒）')).toHaveValue('90');
 expect((screen.getByLabelText('英文音乐描述（可编辑）') as HTMLTextAreaElement).value).toContain('Compose an independent');
 expect(screen.getByLabelText('将少量用户原始声音融入最终作品（仅本地，可关闭）')).not.toBeChecked();
 expect(renderReference).not.toHaveBeenCalled();expect(submitAudio).not.toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'测试 AI 编曲（Mock）'}));await screen.findByRole('heading',{name:'Mock完整流程测试音频（非AI作品）'});
 const call=vi.mocked(submitAudio).mock.calls[0];expect(call[2]).toBeUndefined();expect(call[3]).toContain('No reference audio is attached');expect(call[7]).toBe(90);expect(call[9]).toBe('text-to-audio');expect(submitAudio).toHaveBeenCalledOnce();
});

it('模式切换保留两种自定义Prompt、重新确认付费并不解除旧任务锁',async()=>{
 sessionStorage.clear();vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'local-token',model:'stable-audio-3',duration:30,uiProtocol:2,generationModes:['text-to-audio','audio-to-audio']});
 page();const user=userEvent.setup();await screen.findByText(/真实付费模式/);
 fireEvent.change(screen.getByLabelText('英文音乐描述（可编辑）'),{target:{value:'My independent song custom prompt'}});
 await user.click(screen.getByRole('checkbox',{name:/我确认本次请求生成/}));
 await user.selectOptions(screen.getByLabelText('音乐生成模式'),'audio-to-audio');expect(screen.getByRole('checkbox',{name:/我确认本次请求生成/})).not.toBeChecked();
 expect(screen.getByText(/旧Audio-to-Audio转换可能无法可靠/)).toBeVisible();
 fireEvent.change(screen.getByLabelText('英文音乐描述（可编辑）'),{target:{value:'My legacy transform custom prompt'}});
 await user.selectOptions(screen.getByLabelText('音乐生成模式'),'text-to-audio');expect(screen.getByLabelText('英文音乐描述（可编辑）')).toHaveValue('My independent song custom prompt');
 const stored=JSON.parse(sessionStorage.getItem('wanwu:audio-lab:lab-session:state')!);expect(stored.promptsByMode['audio-to-audio']).toBe('My legacy transform custom prompt');expect(submitAudio).not.toHaveBeenCalled();
});

it('Live连接完成的历史Mock任务仍显示免费来源，查询下载后显式准备才释放且重新确认',async()=>{
 const id='22222222-2222-4222-8222-222222222222';sessionStorage.setItem('wanwu:audio-lab:lab-session',id);
 sessionStorage.setItem('wanwu:audio-lab:lab-session:state',JSON.stringify({version:1,generationMode:'text-to-audio',duration:90,strength:.6,scenario:'success',prompt:'Keep my music prompt',task:{id,state:'complete',canPrepare:false,executionMode:'mock'}}));
 vi.mocked(getLabConfig).mockResolvedValue({mode:'live',token:'live-token',model:'stable-audio-3',duration:30,uiProtocol:2,generationModes:['text-to-audio','audio-to-audio'],runtime:{pid:4000,instanceId:'test-instance',startedAt:'2026-11-02',requestedMode:'live',effectiveMode:'live',envFileMode:'live',keyConfigured:true,explanation:'Live运行'}});
 vi.mocked(getLocalTaskStatus).mockResolvedValue({state:'complete',canPrepare:false,executionMode:'mock',requiresModeSwitch:false,generationMode:'text-to-audio',duration:90});
 page();const user=userEvent.setup();await screen.findByText(/历史任务来源：Mock/);expect(screen.getByText(/进程 PID 4000/)).toBeVisible();expect(screen.queryByText(/提交证据：未能确认/)).not.toBeInTheDocument();expect(sessionStorage.getItem('wanwu:audio-lab:lab-session')).toBe(id);
 expect(fetchAudioResult).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'仅查询已有任务'}));await screen.findByRole('heading',{name:'Mock完整流程测试音频（非AI作品）'});
 expect(screen.getByRole('link',{name:'下载测试音频'})).toHaveAttribute('download','wanwu-mock.wav');expect(sessionStorage.getItem('wanwu:audio-lab:lab-session')).toBe(id);
 await user.click(screen.getByRole('button',{name:'准备下一次测试（不立即生成）'}));expect(sessionStorage.getItem('wanwu:audio-lab:lab-session')).toBeNull();expect(screen.getByRole('checkbox',{name:/我确认本次请求生成/})).not.toBeChecked();expect(screen.getByLabelText('英文音乐描述（可编辑）')).toHaveValue('Keep my music prompt');expect(submitAudio).not.toHaveBeenCalled();
});
