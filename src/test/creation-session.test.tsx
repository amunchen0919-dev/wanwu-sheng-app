import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../app/App';
import { CreationProvider, useCreation } from '../app/CreationContext';
import { DRAFT_KEY } from '../services/storage/draft';
import { builtinSounds } from '../services/sounds/catalog';
import { soundRepository } from '../services/storage/sounds';
import { RhythmAudio } from '../services/audio/RhythmAudio';
import { soundPlayer } from '../services/audio/SoundPlayer';
import type { CreationDraft } from '../types/domain';
const oldRhythm = [{ id:'old-hit', time:0, duration:50, velocity:.65, source:'mouse' }, { id:'old-hit2', time:420, duration:30, velocity:.65, source:'mouse' }];
function seed() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ version:1, sessionId:'old-session', draft:{ rhythm:oldRhythm, selectedSoundIds:[builtinSounds[0].id], preferenceText:'安静的雨声' }, group:builtinSounds.slice(0,6).map(sound => sound.id), cardIndex:3 }));
}
function page(path = '/') { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
function saved() { return JSON.parse(localStorage.getItem(DRAFT_KEY)!); }
function pad() { return screen.getByRole('button', { name:'轻触演奏，敲击录制节奏' }); }
beforeEach(() => { seed(); vi.spyOn(soundRepository, 'list').mockResolvedValue([]); vi.spyOn(RhythmAudio.prototype, 'tap').mockResolvedValue(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('新建、返回、重新编曲的会话边界', () => {
  it('首页开始创作清空旧节奏、选择、偏好和卡片位置，创建新会话，首击0ms', async () => {
    page(); const user = userEvent.setup(); const stop = vi.spyOn(soundPlayer,'stop');
    await user.click(screen.getByRole('button', { name:'开始创作' }));
    expect(saved()).toMatchObject({ draft:{rhythm:[],selectedSoundIds:[],preferenceText:''},cardIndex:0 });
    expect(saved().sessionId).not.toBe('old-session');
    expect(saved().group).toHaveLength(6); expect(new Set(saved().group).size).toBe(6);
    expect(stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name:'试听节奏' })).toBeDisabled();
    await user.click(pad());
    expect(saved().draft.rhythm).toHaveLength(1); expect(saved().draft.rhythm[0].time).toBe(0);
    expect(saved().draft.rhythm[0].id).not.toBe('old-hit');
  });
  it('新建之后立即重挂载，不恢复旧草稿，仍能从0开始', async () => {
    const view = page(); await userEvent.click(screen.getByRole('button',{name:'开始创作'}));
    const sessionId = saved().sessionId; view.unmount(); page('/rhythm');
    expect(saved().sessionId).toBe(sessionId); expect(saved().draft.rhythm).toEqual([]);
    await userEvent.click(pad()); expect(saved().draft.rhythm.map((event: {time:number})=>event.time)).toEqual([0]);
  });
  it('播放中确认重新录制取消旧声音，持久化清空；松开旧按键不会带回旧事件', async () => {
    const play = vi.spyOn(RhythmAudio.prototype,'play').mockResolvedValue();
    const stop = vi.spyOn(RhythmAudio.prototype,'stop');
    const view = page('/rhythm'); const user = userEvent.setup();
    await user.click(screen.getByRole('button',{name:'试听节奏'})); expect(play).toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'重新录制'}));
    await user.click(screen.getByRole('button',{name:'确认清除'}));
    expect(stop).toHaveBeenCalled(); expect(saved().draft.rhythm).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('0 次敲击');
    fireEvent.keyUp(pad(),{key:' '});
    await user.keyboard('{Enter}');
    expect(saved().draft.rhythm).toHaveLength(1); expect(saved().draft.rhythm[0].time).toBe(0);
    await user.click(screen.getByRole('button',{name:'试听节奏'}));
    expect(play.mock.calls.at(-1)![0]).toHaveLength(1);
    expect(play.mock.calls.at(-1)![0][0].id).not.toBe('old-hit');
    await user.click(screen.getByRole('button',{name:'重新录制'}));
    await user.click(screen.getByRole('button',{name:'确认清除'}));
    view.unmount(); page('/rhythm'); expect(saved().draft.rhythm).toEqual([]);
  });
  it('04返回02、05返回04均保留节奏、选择、偏好和卡片位置', async () => {
    page('/sounds/select'); const user = userEvent.setup();
    await user.click(screen.getByRole('link',{name:'返回'})); expect(saved().draft.rhythm).toEqual(oldRhythm);
    await user.click(screen.getByRole('button',{name:/下一步/}));
    expect(screen.getByRole('status')).toHaveTextContent('已选择 1 个');
    expect(saved().cardIndex).toBe(3);
    await user.click(screen.getByRole('button',{name:/下一步/}));
    expect(screen.getByRole('textbox')).toHaveValue('安静的雨声');
    await user.click(screen.getByRole('link',{name:'返回'}));
    expect(saved().draft.selectedSoundIds).toEqual([builtinSounds[0].id]);
    expect(saved().draft.rhythm).toEqual(oldRhythm); expect(saved().sessionId).toBe('old-session');
  });
  it('10重新编曲返回05，保留原节奏、声音与偏好', async () => {
    page('/music/play'); await userEvent.click(screen.getByRole('link',{name:'不喜欢 · 重新编曲'}));
    expect(screen.getByRole('textbox')).toHaveValue('安静的雨声');
    expect(screen.getByRole('button',{name:`试听${builtinSounds[0].name}`})).toBeEnabled();
    expect(saved().draft.rhythm).toEqual(oldRhythm); expect(saved().sessionId).toBe('old-session');
  });
  it('新建不访问或删除长期数据库，个人录音仍可加载，其他存储键不被清空', async () => {
    const personal = {id:'saved-recording',name:'已保存录音',source:'recording' as const,createdAt:1,blobId:'saved-recording'};
    vi.mocked(soundRepository.list).mockResolvedValue([personal]);
    const open = vi.fn(); const deleteDatabase = vi.fn(); vi.stubGlobal('indexedDB',{open,deleteDatabase});
    localStorage.setItem('saved-work-sentinel','长期作品数据');
    page(); const user = userEvent.setup(); await user.click(screen.getByRole('button',{name:'开始创作'}));
    await user.click(screen.getByRole('link',{name:'返回'}));
    await user.click(screen.getByRole('link',{name:'我的声音'}));
    await user.click(screen.getByRole('link',{name:'我的声音库'}));
    expect(await screen.findByRole('heading',{name:'已保存录音'})).toBeVisible();
    expect(open).not.toHaveBeenCalled(); expect(deleteDatabase).not.toHaveBeenCalled();
    expect(localStorage.getItem('saved-work-sentinel')).toBe('长期作品数据');
  });
  it('统一重置清除编曲结果和未保存录音，拒绝旧会话延迟回写', async () => {
    let current!: ReturnType<typeof useCreation>;
    function Probe() { current=useCreation(); return <button onClick={current.startNewCreation}>新建</button>; }
    render(<CreationProvider><Probe /></CreationProvider>);
    act(()=>current.setDraft(previous=>({...previous,composition:{id:'old-result'} as CreationDraft['composition']})));
    act(()=>current.setRecording({id:'pending-old',blob:new Blob(['pending']),createdAt:1,duration:1,mimeType:'audio/mp4'}));
    expect(current.recording?.id).toBe('pending-old');
    const oldSetter=current.setDraft;
    const cleanup=vi.fn(); const unregister=current.registerCleanup(cleanup);
    await userEvent.click(screen.getByRole('button',{name:'新建'}));
    act(()=>oldSetter(previous=>({...previous,rhythm:oldRhythm as CreationDraft['rhythm'],preferenceText:'旧异步回调'})));
    expect(cleanup).toHaveBeenCalledOnce(); expect(current.draft.composition).toBeUndefined();
    expect(current.recording).toBeUndefined(); expect(current.draft.rhythm).toEqual([]);
    expect(saved().draft.preferenceText).toBe(''); unregister();
  });
});
