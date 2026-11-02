import { describe, expect, it } from 'vitest';
import { ScreenRhythmInput } from '../services/rhythm/ScreenRhythmInput';
import type { RhythmEvent } from '../types/domain';
function recorder(initial: RhythmEvent[] = []) {
  let now = 10000;
  let events: RhythmEvent[] = [];
  const input = new ScreenRhythmInput(initial, value => { events = value; }, () => now);
  return { input, at: (time: number) => { now = time; }, events: () => events };
}
describe('单调时钟节奏录制', () => {
  it('首击为0，真实保留420、610、1200ms和按住时长', () => {
    const { input, at, events } = recorder();
    for (const time of [10000, 10420, 10610, 11200]) {
      at(time); input.press('pointer-1', 'touch'); at(time + 50); input.release('pointer-1');
    }
    expect(events().map(event => event.time)).toEqual([0, 420, 610, 1200]);
    expect(events().map(event => event.duration)).toEqual([50, 50, 50, 50]);
    expect(events().every(event => event.velocity === .65)).toBe(true);
  });
  it('快速连续100次敲击不丢失，重复按下不重复，长按及取消结束正确', () => {
    const { input, at, events } = recorder();
    for (let i = 0; i < 100; i++) {
      at(10000 + i * 5); expect(input.press('p', 'mouse')).toBe(true);
      expect(input.press('p', 'mouse')).toBe(false); input.release('p');
    }
    expect(events()).toHaveLength(100);
    at(11000); input.press('key', 'keyboard'); at(12345); input.finish();
    expect(events().at(-1)?.duration).toBe(1345);
  });
  it('试听后或从恢复数据继续不会计入长空白，清除重置时间原点', () => {
    const { input, at, events } = recorder();
    input.press('p', 'touch'); at(10050); input.release('p');
    at(10420); input.press('p', 'touch'); input.finish();
    at(100000); input.press('p', 'touch'); input.release('p');
    expect(events().map(event => event.time)).toEqual([0, 420, 840]);
    input.clear(); expect(events()).toEqual([]);
    at(200000); input.press('p', 'touch'); expect(events()[0].time).toBe(0);
    const restored = recorder(events()); restored.input.press('key', 'keyboard');
    expect(restored.events()[1].time).toBe(400);
  });
  it('真实笔压可用，缺失或非法压力使用默认值，统一订阅和释放', () => {
    const { input, events } = recorder();
    const observed: RhythmEvent[] = [];
    const unsubscribe = input.subscribe(event => observed.push(event));
    input.press('pen', 'touch', .3); input.release('pen');
    expect(events()[0].velocity).toBe(.3);
    expect(observed).toHaveLength(2);
    unsubscribe(); input.press('p', 'mouse', 9); input.disconnect();
    expect(events()[1].velocity).toBe(.65);
    expect(observed).toHaveLength(2);
  });
});
