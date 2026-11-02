import type { RhythmEvent } from '../../types/domain';
import type { RhythmInputAdapter } from '../hardware/contracts';

/** 所有输入时间为单调时钟毫秒。硬件适配器也应输出同一种事件。 */
export class ScreenRhythmInput implements RhythmInputAdapter {
  private events: RhythmEvent[];
  private active = new Map<string, { id: string; down: number }>();
  private origin?: number;
  private base = 0;
  private listeners = new Set<(event: RhythmEvent) => void>();
  constructor(events: RhythmEvent[] = [], private changed: (events: RhythmEvent[]) => void = () => {}, private now = () => performance.now()) {
    this.events = events.map(event => ({ ...event }));
  }
  subscribe(listener: (event: RhythmEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(event: RhythmEvent) { this.changed(this.events.map(item => ({ ...item }))); this.listeners.forEach(listener => listener({ ...event })); }
  press(key: string, source: RhythmEvent['source'], pressure?: number) {
    if (this.active.has(key)) return false;
    const now = this.now();
    if (this.origin === undefined) {
      const last = this.events.at(-1);
      const gaps = this.events.slice(1).map((event, i) => event.time - this.events[i].time).filter(gap => gap > 0).sort((a, b) => a - b);
      const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 400;
      this.base = last ? last.time + Math.max(last.duration, gap) : 0;
      this.origin = now;
    }
    const event: RhythmEvent = { id: crypto.randomUUID(), time: this.base + now - this.origin, duration: 0,
      velocity: pressure && pressure > 0 && pressure <= 1 ? pressure : .65, source };
    this.events.push(event);
    this.active.set(key, { id: event.id, down: now });
    this.publish(event);
    return true;
  }
  release(key: string) {
    const held = this.active.get(key);
    if (!held) return;
    const event = this.events.find(item => item.id === held.id)!;
    event.duration = Math.max(0, this.now() - held.down);
    this.active.delete(key);
    this.publish(event);
  }
  /** 结束一段输入；下次从末尾接续，不计入试听/离页的等待时间。 */
  finish() { for (const key of this.active.keys()) this.release(key); this.origin = undefined; }
  clear() { this.active.clear(); this.origin = undefined; this.base = 0; this.events = []; this.changed([]); }
  disconnect() { this.finish(); this.listeners.clear(); }
}
