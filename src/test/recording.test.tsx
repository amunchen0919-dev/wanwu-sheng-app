import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../app/App';
import { MicrophoneRecorder } from '../services/recording/MicrophoneRecorder';
import { soundRepository } from '../services/storage/sounds';
import { RhythmAudio } from '../services/audio/RhythmAudio';
import type { SoundAsset } from '../types/domain';
import { createGroup } from '../services/sounds/selection';
import { resolveSoundBytes } from '../services/sounds/resolve';
let tracks: { stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }[];
class RecorderMock {
  static isTypeSupported = (type: string) => type === 'audio/mp4';
  state = 'inactive'; mimeType = 'audio/mp4';
  onstop?: () => void; onerror?: () => void; ondataavailable?: (event: { data: Blob }) => void;
  constructor(_stream: unknown, options?: { mimeType: string }) { this.mimeType = options?.mimeType ?? ''; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['real-mock-data'], { type: this.mimeType }) }); this.onstop?.(); }
}
let saved: SoundAsset[];
let blobs: Map<string, Blob>;
let media: { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; currentTime: number; onended: (() => void) | null; onerror: (() => void) | null; removeAttribute: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> };
beforeEach(() => {
  tracks = [{ stop: vi.fn(), onended: null }]; saved = []; blobs = new Map();
  vi.stubGlobal('MediaRecorder', RecorderMock);
  vi.stubGlobal('Audio', class { constructor() { return media; } });
  media = { play: vi.fn(async () => {}), pause: vi.fn(), currentTime: 0, onended: null, onerror: null, removeAttribute: vi.fn(), load: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks, getAudioTracks: () => tracks })) } });
  vi.spyOn(RhythmAudio.prototype, 'tap').mockResolvedValue();
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:recording'); static revokeObjectURL = vi.fn(); });
  vi.spyOn(soundRepository, 'list').mockImplementation(async () => [...saved]);
  vi.spyOn(soundRepository, 'save').mockImplementation(async (asset, blob) => { saved = [asset, ...saved.filter(item => item.id !== asset.id)]; blobs.set(asset.blobId!, blob!); });
  vi.spyOn(soundRepository, 'getBlob').mockImplementation(async id => blobs.get(id));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function page(path = '/record') { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
async function record() {
  const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: '开始录音' }));
  expect(screen.getByRole('heading', { level: 1, name: '录音' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /结束录音/ }));
  await screen.findByRole('heading', { level: 1, name: '录音完成' }); return user;
}
describe('真实录音流程（设备API模拟）', () => {
  it('开始停留06，结束到15，真实Blob可试听和停止，资源及URL释放', async () => {
    const view = page(); const user = await record();
    expect(tracks[0].stop).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '试听录音' })); expect(media.play).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '停止试听录音' })); expect(media.pause).toHaveBeenCalled();
    view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording');
  });
  it('保存到09并播报成功，重挂载后读取库，可用于创作及05试听', async () => {
    const view = page(); const user = await record();
    await user.click(screen.getByRole('button', { name: '保存声音' }));
    expect(await screen.findByText('✓ 已加入新的声音')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('我的声音库');
    expect(saved).toHaveLength(1); expect(blobs.get(saved[0].id)?.size).toBeGreaterThan(0);
    view.unmount(); page('/library');
    await screen.findByRole('heading', { name: '我的录音 1' });
    await user.click(screen.getByRole('button', { name: '用于创作' }));
    expect(screen.getByRole('region', { name: '声音卡片' })).toHaveTextContent('我的录音 1');
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('button', { name: '试听我的录音 1' })).toBeEnabled();
    expect(createGroup(saved, [], () => .999)).toContain(saved[0].id);
  });
  it('保存失败停留15，重试成功不会重复入库', async () => {
    page(); const user = await record(); vi.mocked(soundRepository.save).mockRejectedValueOnce(new Error('quota'));
    await user.click(screen.getByRole('button', { name: '保存声音' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('录音完成');
    await user.click(screen.getByRole('button', { name: '保存声音' }));
    await screen.findByText('✓ 已加入新的声音'); expect(saved).toHaveLength(1);
    const calls = vi.mocked(soundRepository.save).mock.calls; expect(calls[0][0].id).toBe(calls[1][0].id);
  });
  it('权限拒绝不进入录音状态也不跳转', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    page(); await userEvent.click(screen.getByRole('button', { name: '开始录音' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('权限被拒绝');
    expect(screen.getByRole('button', { name: /结束录音/ })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('录音');
  });
  it('离页取消录音，迟到权限结果也释放资源', async () => {
    let resolve!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise(done => { resolve = done; }));
    const recorder = new MicrophoneRecorder(); const task = recorder.start(); recorder.cancel();
    resolve({ getTracks: () => tracks, getAudioTracks: () => tracks } as unknown as MediaStream);
    await expect(task).rejects.toThrow('取消'); expect(tracks[0].stop).toHaveBeenCalled();
  });
  it('60秒自动停止，正常释放麦克风；中断会报错', async () => {
    vi.useFakeTimers(); const recorder = new MicrophoneRecorder(); await recorder.start();
    await vi.advanceTimersByTimeAsync(60000); expect((await recorder.result!)?.duration).toBe(60);
    expect(tracks[0].stop).toHaveBeenCalled();
    const next = new MicrophoneRecorder(); await next.start(); tracks[0].onended?.();
    await expect(next.result).rejects.toThrow('中断'); next.cancel();
  });
  it('后续编曲按ID可读到实际音频字节', async () => {
    const bytes = new Uint8Array([1,2,3]).buffer;
    saved = [{ id:'rec-1', name:'录音', source:'recording', createdAt:1, blobId:'blob-1' }];
    blobs.set('blob-1', { arrayBuffer: async () => bytes } as Blob);
    expect(await resolveSoundBytes('rec-1')).toEqual(bytes);
  });
});
