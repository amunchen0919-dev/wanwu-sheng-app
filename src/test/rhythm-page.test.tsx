import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../app/App';
import { DRAFT_KEY } from '../services/storage/draft';
import { RhythmAudio } from '../services/audio/RhythmAudio';
function renderPage(path = '/rhythm') { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
function pad() { return screen.getByRole('button', { name: '轻触演奏，敲击录制节奏' }); }
function rhythm() { return JSON.parse(localStorage.getItem(DRAFT_KEY)!).draft.rhythm; }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('节奏页面与创作状态', () => {
  it('Pointer Events触摸后兼容click不重复，记录按住时长', async () => {
    vi.spyOn(RhythmAudio.prototype, 'tap').mockResolvedValue();
    const user = userEvent.setup(); renderPage();
    await user.pointer([{ keys: '[TouchA>]', target: pad() }, { keys: '[/TouchA]' }]);
    fireEvent.click(pad(), { detail: 1 });
    expect(rhythm()).toHaveLength(1);
    expect(rhythm()[0]).toMatchObject({ time: 0, source: 'touch', velocity: .65 });
    expect(rhythm()[0].duration).toBeGreaterThanOrEqual(0);
  });
  it('键盘空格/回车可录制，重复keydown不重复，清除需确认', async () => {
    vi.spyOn(RhythmAudio.prototype, 'tap').mockResolvedValue();
    const user = userEvent.setup(); renderPage(); pad().focus();
    fireEvent.keyDown(pad(), { key: ' ', repeat: false });
    fireEvent.keyDown(pad(), { key: ' ', repeat: true });
    fireEvent.keyUp(pad(), { key: ' ' });
    await user.keyboard('{Enter}');
    expect(rhythm()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '重新录制' }));
    await user.click(screen.getByRole('button', { name: '保留节奏' }));
    expect(rhythm()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '重新录制' }));
    await user.click(screen.getByRole('button', { name: '确认清除' }));
    expect(rhythm()).toEqual([]); expect(pad()).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('节奏已清除');
  });
  it('空节奏阻止下一步；02到04到05后可返回，刷新恢复节奏和选择', async () => {
    vi.spyOn(RhythmAudio.prototype, 'tap').mockResolvedValue();
    const user = userEvent.setup(); const view = renderPage();
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('status')).toHaveTextContent('请先轻触');
    await user.click(pad()); const original = rhythm();
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('选择声音');
    await user.click(screen.getByRole('button', { name: '喜欢' }));
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByText('已记录 1 次敲击')).toBeVisible();
    expect(screen.getByRole('button', { name: '试听节奏' })).toBeEnabled();
    await user.click(screen.getByRole('link', { name: '返回' }));
    await user.click(screen.getByRole('link', { name: '返回' }));
    expect(rhythm()).toEqual(original);
    view.unmount(); renderPage(); expect(rhythm()).toEqual(original);
    expect(screen.getByText('已记录 1 次敲击')).toBeVisible();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).draft.selectedSoundIds).toHaveLength(1);
  });
  it('试听可停止、自然结束、离页释放，重新录制先停止旧播放', async () => {
    vi.spyOn(RhythmAudio.prototype, 'tap').mockResolvedValue();
    let done!: () => void;
    const play = vi.spyOn(RhythmAudio.prototype, 'play').mockImplementation(async (_events, ended) => { done = ended; });
    const stop = vi.spyOn(RhythmAudio.prototype, 'stop');
    const dispose = vi.spyOn(RhythmAudio.prototype, 'dispose');
    const user = userEvent.setup(); renderPage(); await user.click(pad());
    await user.click(screen.getByRole('button', { name: '试听节奏' }));
    expect(play).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('正在试听');
    await user.click(screen.getByRole('button', { name: '停止试听节奏' })); expect(stop).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '试听节奏' }));
    act(() => done()); expect(screen.getByRole('button', { name: '试听节奏' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '试听节奏' }));
    await user.click(screen.getByRole('button', { name: '重新录制' }));
    expect(stop).toHaveBeenCalled();
    await user.click(screen.getByRole('link', { name: '返回' })); expect(dispose).toHaveBeenCalled();
  });
  it('不支持音频时仍保存节奏，并显示合理错误', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const user = userEvent.setup(); renderPage(); await user.click(pad());
    expect(await screen.findByRole('alert')).toHaveTextContent('不支持 Web Audio');
    expect(rhythm()).toHaveLength(1);
  });
  it('损坏草稿安全回退；存储失败可见提示', () => {
    localStorage.setItem(DRAFT_KEY, '{invalid');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    renderPage();
    expect(screen.getByRole('button', { name: '试听节奏' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('无法保存创作草稿');
  });
});
