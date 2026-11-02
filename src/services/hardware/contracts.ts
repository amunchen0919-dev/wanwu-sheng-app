import type { RhythmEvent } from '../../types/domain';
// 触摸、键盘和未来实体球可接入同一个节奏事件入口，time 单位为毫秒。
export interface RhythmInputAdapter {
  subscribe(listener: (event: RhythmEvent) => void): () => void;
  disconnect(): void;
}
