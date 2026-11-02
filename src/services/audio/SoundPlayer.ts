import { soundBytes } from '../sounds/resolve';
import type { SoundAsset } from '../../types/domain';
export type PlaybackState = { soundId?: string; status: 'idle' | 'loading' | 'playing' | 'paused'; error?: string };
/** 单一输出，Web Audio 播放位置用 AudioContext 时钟计算；切换时取消尚未完成的加载。 */
export class SoundPlayer {
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private gain?: GainNode;
  private buffer?: AudioBuffer;
  private offset = 0;
  private started = 0;
  private version = 0;
  private state: PlaybackState = { status: 'idle' };
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(state: PlaybackState) { this.state = state; this.listeners.forEach(listener => listener()); }
  stop = () => {
    this.version++;
    if (this.source) { this.source.onended = null; this.source.stop(); this.source.disconnect(); this.source = undefined; }
    this.gain?.disconnect(); this.gain = undefined;
    this.offset = 0;
    this.buffer = undefined;
    this.update({ status: 'idle' });
  };
  pause = () => {
    if (!this.context || this.state.status !== 'playing') return;
    this.offset += this.context.currentTime - this.started;
    if (this.source) { this.source.onended = null; this.source.stop(); this.source.disconnect(); this.source = undefined; }
    this.gain?.disconnect(); this.gain = undefined;
    this.update({ soundId: this.state.soundId, status: 'paused' });
  };
  toggle = async (asset: SoundAsset) => {
    if (this.state.soundId === asset.id && this.state.status === 'playing') { this.pause(); return; }
    const resume = this.state.soundId === asset.id && this.state.status === 'paused';
    if (!resume) this.stop();
    const version = ++this.version;
    this.update({ soundId: asset.id, status: 'loading' });
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      if (version !== this.version) return;
      if (!resume) {
        const buffer = await this.context.decodeAudioData(await soundBytes(asset));
        if (version !== this.version) return;
        this.buffer = buffer;
      }
      if (!this.buffer) throw new Error('声音无法解码');
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      const gain = this.context.createGain();
      this.gain = gain;
      gain.gain.value = .65;
      source.connect(gain).connect(this.context.destination);
      this.source = source;
      this.started = this.context.currentTime;
      source.onended = () => { source.disconnect(); gain.disconnect(); if (version === this.version) this.stop(); };
      source.start(0, this.offset);
      this.update({ soundId: asset.id, status: 'playing' });
    } catch (error) {
      if (version !== this.version) return;
      this.stop();
      this.update({ status: 'idle', error: `无法播放：${error instanceof Error ? error.message : '请检查浏览器音频支持后重试'}` });
    }
  };
  async dispose() { this.stop(); await this.context?.close(); this.context = undefined; }
}
export const soundPlayer = new SoundPlayer();
