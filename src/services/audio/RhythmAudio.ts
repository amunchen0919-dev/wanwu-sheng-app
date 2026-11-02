import type { RhythmEvent } from '../../types/domain';

/** 每个页面实例仅创建一个上下文；所有声音使用音频时钟调度。 */
export class RhythmAudio {
  private context?: AudioContext;
  private output?: DynamicsCompressorNode;
  private voices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();
  private generation = 0;
  private disposed = false;
  constructor(private createContext = () => {
    const Constructor = globalThis.AudioContext;
    if (!Constructor) throw new Error('浏览器不支持 Web Audio，请使用新版 Safari 或 Chrome');
    return new Constructor();
  }) {}
  private async ready() {
    if (this.disposed) throw new Error('音频已关闭，请重新进入页面');
    this.context ??= this.createContext();
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('浏览器未允许音频播放，请再次点击试听');
    return this.context;
  }
  private tone(context: AudioContext, time: number, velocity: number, ended?: () => void) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const voice = { oscillator, gain };
    this.voices.add(voice);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(420, time);
    oscillator.frequency.exponentialRampToValueAtTime(150, time + .09);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(.18 * Math.max(0, Math.min(1, velocity)), time + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .14);
    if (!this.output) {
      this.output = context.createDynamicsCompressor();
      this.output.threshold.value = -12;
      this.output.knee.value = 12;
      this.output.ratio.value = 8;
      this.output.attack.value = .003;
      this.output.release.value = .1;
      this.output.connect(context.destination);
    }
    oscillator.connect(gain).connect(this.output);
    oscillator.onended = () => { this.voices.delete(voice); oscillator.disconnect(); gain.disconnect(); ended?.(); };
    oscillator.start(time);
    oscillator.stop(time + .15);
  }
  async tap(velocity: number) {
    const version = this.generation;
    const context = await this.ready();
    if (version === this.generation && !this.disposed) this.tone(context, context.currentTime, velocity);
  }
  async play(events: RhythmEvent[], ended: () => void) {
    this.stop();
    const version = this.generation;
    const context = await this.ready();
    if (version !== this.generation || this.disposed) return;
    const ordered = [...events].sort((a, b) => a.time - b.time);
    const base = context.currentTime + .035;
    if (!ordered.length) { ended(); return; }
    ordered.forEach((event, i) => this.tone(context, base + event.time / 1000, event.velocity,
      i === ordered.length - 1 ? () => { if (version === this.generation) ended(); } : undefined));
  }
  stop() {
    this.generation++;
    for (const { oscillator, gain } of this.voices) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch { /* 已结束的节点无需再次停止 */ }
      oscillator.disconnect(); gain.disconnect();
    }
    this.voices.clear();
  }
  async dispose() { this.disposed = true; this.stop(); const context = this.context; this.context = undefined; this.output?.disconnect(); this.output = undefined; await context?.close(); }
}
