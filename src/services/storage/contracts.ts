import type { Composition, SoundAsset } from '../../types/domain';
// 数据库v2保留sounds/blobs，新增music作品仓；升级不删除既有音频。
export const DATABASE_NAME = 'wanwu-sound';
export const DATABASE_VERSION = 2;
export interface SoundRepository {
  list(): Promise<SoundAsset[]>;
  save(asset: SoundAsset, blob?: Blob): Promise<void>;
  getBlob(blobId: string): Promise<Blob | undefined>;
}
export interface CompositionRepository {
  list(): Promise<Composition[]>;
  save(composition: Composition): Promise<void>;
  get(id: string): Promise<Composition | undefined>;
}
