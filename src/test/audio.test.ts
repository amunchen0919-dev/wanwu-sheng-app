import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundPlayer } from '../services/audio/SoundPlayer';
import { builtinSounds } from '../services/sounds/catalog';
import { readFileSync } from 'node:fs';
const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
class Context {
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  decodeAudioData = vi.fn(async () => ({ duration: 2 }));
  createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createBufferSource() {
    const source = { start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null, connect: vi.fn((gain) => gain), buffer: undefined };
    sources.push(source); return source;
  }
}
afterEach(() => { vi.unstubAllGlobals(); sources.length = 0; });
function setup() {
  const context = new Context();
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  return { player: new SoundPlayer(), context };
}
describe('真实素材与统一播放器', () => {
  it('十个本地 WAV 均有有效头部、时长和非静音采样', () => {
    for (const sound of builtinSounds) {
      const data = readFileSync(`public${sound.builtinUrl}`);
      expect(data.toString('ascii', 0, 4)).toBe('RIFF');
      expect(data.toString('ascii', 8, 12)).toBe('WAVE');
      expect(data.readUInt32LE(24)).toBe(22050);
      expect(data.length).toBe(44 + 22050 * 2 * 2);
      expect(data.subarray(44).some(value => value !== 0)).toBe(true);
    }
  });
  it('播放、暂停后从原位置继续，切换和停止释放旧输出', async () => {
    const { player, context } = setup();
    await player.toggle(builtinSounds[0]);
    expect(player.getSnapshot().status).toBe('playing');
    context.currentTime = .7;
    player.pause();
    expect(sources[0].stop).toHaveBeenCalled();
    expect(player.getSnapshot().status).toBe('paused');
    await player.toggle(builtinSounds[0]);
    expect(sources[1].start).toHaveBeenCalledWith(0, .7);
    await player.toggle(builtinSounds[1]);
    expect(sources[1].stop).toHaveBeenCalled();
    expect(player.getSnapshot().soundId).toBe(builtinSounds[1].id);
    sources[2].onended?.();
    expect(player.getSnapshot().status).toBe('idle');
    await player.dispose();
    expect(context.close).toHaveBeenCalled();
  });
  it('切换期间旧加载返回也不会开始播放', async () => {
    const { player } = setup();
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(done => { resolve = done; })));
    const loading = player.toggle(builtinSounds[0]);
    await Promise.resolve();
    player.stop();
    resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    await loading;
    expect(sources).toHaveLength(0);
    expect(player.getSnapshot().status).toBe('idle');
  });
  it('加载失败提供明确错误', async () => {
    const { player } = setup();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    await player.toggle(builtinSounds[0]);
    expect(player.getSnapshot().error).toContain('声音文件无法读取');
  });
});
