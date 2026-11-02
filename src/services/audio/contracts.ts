import type { RhythmEvent, SoundAsset } from '../../types/domain';
export interface AudioService {
  unlock(): Promise<void>;
  preview(asset: SoundAsset): Promise<void>;
  playRhythm(events: RhythmEvent[]): Promise<void>;
  stop(): void;
  dispose(): Promise<void>;
}
