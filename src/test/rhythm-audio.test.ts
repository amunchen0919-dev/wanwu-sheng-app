import { afterEach, describe, expect, it, vi } from 'vitest';
import { RhythmAudio } from '../services/audio/RhythmAudio';
import type { RhythmEvent } from '../types/domain';
const event = (time: number): RhythmEvent => ({ id: String(time), time, duration: 20, velocity: .65, source: 'mouse' });
function setup() {
  const nodes: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const context = {
    state: 'running', currentTime: 10, destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    createDynamicsCompressor: vi.fn(() => ({ threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() })),
    createGain: vi.fn(() => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() })),
    createOscillator: vi.fn(() => {
      const node = { frequency: param(), type: '', connect: vi.fn(gain => gain), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null };
      nodes.push(node); return node;
    }),
  };
  const create = vi.fn(() => context as unknown as AudioContext);
  return { nodes, context, create, audio: new RhythmAudio(create) };
}
afterEach(() => vi.unstubAllGlobals());
describe('Web Audio节奏调度', () => {
  it('按原始毫秒间隔排序调度，并通过最后节点结束恢复状态', async () => {
    const { audio, nodes } = setup(); const done = vi.fn();
    await audio.play([event(610), event(0), event(420)], done);
    expect(nodes.map(node => node.start.mock.calls[0][0])).toEqual([10.035, 10.455, 10.645]);
    expect(done).not.toHaveBeenCalled(); nodes[2].onended?.(); expect(done).toHaveBeenCalledOnce();
    await audio.dispose();
  });
  it('停止取消所有未来声音，重复敲击复用上下文，释放关闭上下文', async () => {
    const { audio, nodes, create, context } = setup(); const done = vi.fn();
    await audio.play([event(0), event(2000)], done); audio.stop();
    expect(nodes.every(node => node.stop.mock.calls.length === 2 && node.onended === null)).toBe(true);
    expect(nodes.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
    expect(done).not.toHaveBeenCalled();
    await audio.tap(.65); await audio.tap(.65); expect(create).toHaveBeenCalledOnce();
    await audio.dispose(); expect(context.close).toHaveBeenCalledOnce();
  });
  it('音频解锁尚未完成时停止，也不会在稍后开始播放', async () => {
    const { audio, nodes, context } = setup(); let resolve!: () => void;
    context.resume.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const task = audio.play([event(0)], vi.fn()); audio.stop(); resolve(); await task;
    expect(nodes).toHaveLength(0);
    await audio.dispose();
  });
  it('不支持Web Audio或自动播放被阻止时提供错误', async () => {
    vi.stubGlobal('AudioContext', undefined);
    await expect(new RhythmAudio().tap(.65)).rejects.toThrow('不支持 Web Audio');
    const { audio, context } = setup(); context.state = 'suspended';
    await expect(audio.tap(.65)).rejects.toThrow('未允许音频');
    await audio.dispose();
  });
});
